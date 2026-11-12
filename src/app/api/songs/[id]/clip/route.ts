import type { NextRequest } from "next/server";
import { existsSync, promises as fs } from "fs";
import path from "path";
import { spawn } from "child_process";
import { fail, handle } from "@/lib/api";
import { getSongById } from "@/lib/queries";
import { readLocalFile } from "@/lib/storage";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLIPS_DIR = path.join(process.cwd(), "data", "clips");
// Downloaded source audio cache — songs are immutable, so keep the file
// across requests. 2nd+ clip extractions for a song skip the download.
const SRC_DIR = path.join(process.cwd(), "data", "clip-src");
// Statically scoped binary path (avoids whole-project tracing warnings)
const FFMPEG_STATIC = path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg");

/** Resolve FFmpeg binary path (ffmpeg-static in dev, system ffmpeg in prod) */
function getFFmpegPath(): string {
  try {
    if (existsSync(FFMPEG_STATIC)) return FFMPEG_STATIC;
  } catch {}
  return "ffmpeg";
}

function execFFmpeg(args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getFFmpegPath(), args);
    const chunks: Buffer[] = [];
    proc.stdout?.on("data", (c: Buffer) => chunks.push(c));
    proc.stderr?.on("data", (d: Buffer) => {
      // Capture stderr for debugging but don't spam
      if (process.env.DEBUG_FFMPEG) console.error("[ffmpeg]", d.toString().slice(0, 200));
    });
    proc.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}

/**
 * GET /api/songs/:id/clip?offset=45&duration=30
 *
 * Extracts a segment of a song using FFmpeg.
 * Server-side extraction → the clip starts EXACTLY at the requested offset.
 * Cached on disk — same offset always serves instantly.
 * Public endpoint (no auth) — used by Abnormal's Notes feature.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await params;
    if (!UUID_RE.test(id)) return fail("Invalid song id", 400);

    const url = new URL(req.url);
    const rawOffset = Math.max(0, parseFloat(url.searchParams.get("offset") ?? "0") || 0);
    const duration = Math.min(60, Math.max(5, parseFloat(url.searchParams.get("duration") ?? "30") || 30));

    const song = await getSongById(id, null);
    if (!song) return fail("Song not found", 404);

    // Clamp offset into the song so out-of-range requests still return a valid clip
    const songLen = song.durationSec ?? 0;
    const maxOffset = songLen > 0 ? Math.max(0, songLen - duration) : rawOffset;
    const offset = Math.min(rawOffset, maxOffset);

    const cacheKey = `${id}_${Math.round(offset)}_${Math.round(duration)}.mp3`;
    const clipPath = path.join(CLIPS_DIR, cacheKey);

    // ─── Serve from disk cache if exists ───
    try {
      const cached = await fs.readFile(clipPath);
      return new Response(new Uint8Array(cached), {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Length": String(cached.length),
          "Cache-Control": "public, max-age=86400, immutable",
        },
      });
    } catch {
      // not cached — extract
    }

    await fs.mkdir(CLIPS_DIR, { recursive: true });

    // ─── Get the source audio (cached in data/clip-src) ───
    const srcPath = path.join(SRC_DIR, id);
    let srcReady = existsSync(srcPath);

    if (!srcReady) {
      await fs.mkdir(SRC_DIR, { recursive: true });

      // Try local storage first (fastest)
      const local = await readLocalFile(song.audioFileId, null);
      if (local) {
        const buf = Buffer.from(await local.arrayBuffer());
        await fs.writeFile(srcPath, buf);
        srcReady = true;
      }

      // Fall back to Dropin CDN
      if (!srcReady) {
        const dropinHeaders: Record<string, string> = {
          "X-Access-Key": process.env.DROPIN_ACCESS_KEY ?? "",
          "X-Access-Key-Id": process.env.DROPIN_ACCESS_KEY_ID ?? "",
          "X-Api-Key": process.env.DROPIN_API_KEY ?? "",
        };
        const upstream = await fetch(
          `${process.env.DROPIN_HOST}/api/public/cdn/files/${encodeURIComponent(song.audioFileId)}`,
          { headers: dropinHeaders },
        );
        if (upstream.ok) {
          const buf = Buffer.from(await upstream.arrayBuffer());
          await fs.writeFile(srcPath, buf);
          srcReady = true;
        }
      }
    }

    if (!srcReady) return fail("Could not access audio file", 503);

    // ─── FFmpeg: extract the segment from the local file ───
    try {
      const clipBuffer = await execFFmpeg([
        "-ss", String(offset),
        "-t", String(duration),
        "-i", srcPath,
        "-vn",
        "-acodec", "libmp3lame",
        "-b:a", "128k",
        "-ar", "44100",
        "-ac", "2",
        "-f", "mp3",
        "pipe:1",
      ]);

      // Save to cache (fire-and-forget)
      void fs.writeFile(clipPath, clipBuffer).catch(() => {});

      return new Response(new Uint8Array(clipBuffer), {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Length": String(clipBuffer.length),
          "Cache-Control": "public, max-age=86400, immutable",
        },
      });
    } catch (e) {
      console.error("[clip] ffmpeg failed:", e);
      return fail("Could not extract clip", 500);
    }
  });
}
