import { randomUUID } from "crypto";
import { createReadStream, promises as fs } from "fs";
import path from "path";
import { Readable } from "stream";

/**
 * Storage layer with a pluggable provider:
 *
 *  - "dropin"  — the Dropin CDN API (https://dropin.cognixai.cloud).
 *                Uploads POST multipart to /api/public/upload with the 3 keys;
 *                downloads are proxied through /api/cdn/files/[id] with
 *                byte-range passthrough so audio seeking works.
 *  - "local"   — fallback provider: files live on this server's disk and are
 *                served from the same proxy route with full range support.
 *
 * Serving always checks the local store first, so locally-seeded files and
 * Dropin files coexist seamlessly.
 */

export type StorageProvider = "dropin" | "local";

export interface StoredFile {
  id: string;
  name: string;
  size: number;
  mime: string;
}

export interface UploadResult extends StoredFile {
  provider: StorageProvider;
  /** true when the primary provider failed and the file was stored locally instead */
  fallback?: boolean;
  warning?: string;
}

const LOCAL_DIR = path.join(process.cwd(), "data", "uploads");
export const MAX_FILE_BYTES = 150 * 1024 * 1024; // 150 MB

/* ------------------------------------------------------------------ */
/* Dropin CDN API                                                      */
/* ------------------------------------------------------------------ */

function dropinHeaders() {
  return {
    "X-Access-Key": process.env.DROPIN_ACCESS_KEY ?? "",
    "X-Access-Key-Id": process.env.DROPIN_ACCESS_KEY_ID ?? "",
    "X-Api-Key": process.env.DROPIN_API_KEY ?? "",
  };
}

function activeProvider(): StorageProvider {
  return process.env.STORAGE_PROVIDER === "local" ? "local" : "dropin";
}

/* ------------------------------------------------------------------ */
/* Local store                                                         */
/* ------------------------------------------------------------------ */

function safe(id: string) {
  // ids are uuids; sanitize defensively anyway
  return id.replace(/[^a-zA-Z0-9\-_]/g, "");
}

async function saveLocal(file: File): Promise<StoredFile> {
  const id = randomUUID();
  const dir = path.join(LOCAL_DIR, id);
  await fs.mkdir(dir, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(dir, "file"), buf);
  const meta = {
    name: file.name || "file",
    size: buf.length,
    mime: file.type || "application/octet-stream",
  };
  await fs.writeFile(path.join(dir, "meta.json"), JSON.stringify(meta));
  return { id, ...meta };
}

export async function localFileMeta(id: string): Promise<StoredFile | null> {
  const dir = path.join(LOCAL_DIR, safe(id));
  try {
    const raw = await fs.readFile(path.join(dir, "meta.json"), "utf8");
    return JSON.parse(raw) as StoredFile;
  } catch {
    return null;
  }
}

/** Serve a local file with HTTP range support. Returns null if not found. */
export async function readLocalFile(id: string, range: string | null): Promise<Response | null> {
  const dir = path.join(LOCAL_DIR, safe(id));
  const filePath = path.join(dir, "file");
  try {
    const stat = await fs.stat(filePath);
    const meta = (await localFileMeta(id)) ?? { id, name: id, size: stat.size, mime: "application/octet-stream" };
    const total = stat.size;

    const baseHeaders: Record<string, string> = {
      "Content-Type": meta.mime || "application/octet-stream",
      "Accept-Ranges": "bytes",
      // File ids are content-addressed (fresh UUID per upload) — safe to cache forever
      "Cache-Control": "public, max-age=31536000, immutable",
    };

    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      if (m) {
        let start = m[1] === "" ? 0 : parseInt(m[1], 10);
        let end = m[2] === "" ? total - 1 : parseInt(m[2], 10);
        if (m[1] === "" && m[2] !== "") {
          // suffix range: bytes=-N => last N bytes
          start = Math.max(0, total - parseInt(m[2], 10));
          end = total - 1;
        }
        end = Math.min(end, total - 1);
        if (start > end || start >= total) {
          return new Response(null, {
            status: 416,
            headers: { "Content-Range": `bytes */${total}` },
          });
        }
        const stream = Readable.toWeb(
          createReadStream(filePath, { start, end }),
        ) as unknown as ReadableStream;
        return new Response(stream, {
          status: 206,
          headers: {
            ...baseHeaders,
            "Content-Range": `bytes ${start}-${end}/${total}`,
            "Content-Length": String(end - start + 1),
          },
        });
      }
    }

    const stream = Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream;
    return new Response(stream, {
      status: 200,
      headers: { ...baseHeaders, "Content-Length": String(total) },
    });
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export async function uploadFile(file: File): Promise<UploadResult> {
  if (file.size > MAX_FILE_BYTES) throw new Error("File is too large (max 150 MB)");

  if (activeProvider() === "dropin") {
    try {
      const fd = new FormData();
      fd.append("file", file, file.name || "file");
      const res = await fetch(`${process.env.DROPIN_HOST}/api/public/upload`, {
        method: "POST",
        headers: dropinHeaders(),
        body: fd,
      });
      if (!res.ok) throw new Error(`Dropin responded ${res.status}`);
      const data = (await res.json()) as { id: string; name?: string; size?: number };
      return {
        id: data.id,
        name: data.name ?? file.name,
        size: data.size ?? file.size,
        mime: file.type || "application/octet-stream",
        provider: "dropin",
      };
    } catch (err) {
      // Never hard-fail an upload: fall back to local storage.
      const stored = await saveLocal(file);
      return {
        ...stored,
        provider: "local",
        fallback: true,
        warning: `Dropin upload failed (${err instanceof Error ? err.message : "unknown error"}). File stored locally instead.`,
      };
    }
  }

  const stored = await saveLocal(file);
  return { ...stored, provider: "local" };
}

/** Stream a stored file (any provider) for a client request with optional Range. */
export async function readStoredFile(id: string, range: string | null): Promise<Response> {
  // 1) local store first (seeded/fallback files)
  const local = await readLocalFile(id, range);
  if (local) return local;

  // 2) Dropin CDN passthrough
  const headers: Record<string, string> = { ...dropinHeaders() };
  if (range) headers["Range"] = range;
  const upstream = await fetch(
    `${process.env.DROPIN_HOST}/api/public/cdn/files/${encodeURIComponent(id)}`,
    { headers },
  );

  const passHeaders: Record<string, string> = {
    "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
    "Accept-Ranges": upstream.headers.get("accept-ranges") ?? "bytes",
  };
  for (const h of ["content-length", "content-range", "etag", "last-modified"]) {
    const v = upstream.headers.get(h);
    if (v) passHeaders[h.replace(/(^\w|-\w)/g, (s) => s.toUpperCase())] = v;
  }
  if (upstream.ok || upstream.status === 206) {
    // File ids are content-addressed (fresh UUID per upload) — safe to cache forever
    passHeaders["Cache-Control"] = "public, max-age=31536000, immutable";
  }
  return new Response(upstream.body, { status: upstream.status, headers: passHeaders });
}

/** Admin storage health check: can we upload & read back on each provider? */
export async function storageHealth() {
  const probe = new File([new TextEncoder().encode("groove health probe")], "probe.txt", {
    type: "text/plain",
  });
  const report: Record<string, unknown> = { provider: activeProvider() };

  // local
  try {
    const stored = await saveLocal(probe);
    const res = await readLocalFile(stored.id, null);
    report.local = res ? "ok" : "write ok, read failed";
  } catch (e) {
    report.local = `error: ${e instanceof Error ? e.message : "unknown"}`;
  }

  // dropin
  try {
    const fd = new FormData();
    fd.append("file", probe, "probe.txt");
    const res = await fetch(`${process.env.DROPIN_HOST}/api/public/upload`, {
      method: "POST",
      headers: dropinHeaders(),
      body: fd,
    });
    if (!res.ok) throw new Error(`upload ${res.status}`);
    const data = (await res.json()) as { id: string };
    const fetched = await fetch(
      `${process.env.DROPIN_HOST}/api/public/cdn/files/${data.id}`,
      { headers: dropinHeaders() },
    );
    const body = await fetched.text();
    report.dropin =
      fetched.ok && body.includes("groove health probe")
        ? "ok"
        : `upload ok, download failed (${fetched.status}: ${body.slice(0, 40)})`;
  } catch (e) {
    report.dropin = `error: ${e instanceof Error ? e.message : "unknown"}`;
  }

  return report;
}
