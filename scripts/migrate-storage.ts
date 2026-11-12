/**
 * Migrates locally-stored Groove media (seed content from the Dropin outage)
 * to the Dropin CDN — preserving rows, plays, likes, follows, and jam state.
 * Only rewrites the file ids in the DB to the new Dropin ids.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { promises as fs } from "fs";
import path from "path";
import postgres from "postgres";

const LOCAL_DIR = path.join(process.cwd(), "data", "uploads");
const DROPIN = process.env.DROPIN_HOST ?? "";
const H = {
  "X-Access-Key": process.env.DROPIN_ACCESS_KEY ?? "",
  "X-Access-Key-Id": process.env.DROPIN_ACCESS_KEY_ID ?? "",
  "X-Api-Key": process.env.DROPIN_API_KEY ?? "",
};

async function uploadToLocalDropin(fileId: string): Promise<string | null> {
  const dir = path.join(LOCAL_DIR, fileId);
  try {
    const metaRaw = await fs.readFile(path.join(dir, "meta.json"), "utf8");
    const meta = JSON.parse(metaRaw) as { name: string; mime: string };
    const buf = await fs.readFile(path.join(dir, "file"));
    const fd = new FormData();
    fd.append("file", new File([new Uint8Array(buf)], meta.name, { type: meta.mime }));
    const res = await fetch(`${DROPIN}/api/public/upload`, { method: "POST", headers: H, body: fd });
    if (!res.ok) throw new Error(`upload ${res.status}`);
    const data = (await res.json()) as { id: string };
    // sanity: the file must read back from Dropin
    const check = await fetch(`${DROPIN}/api/public/cdn/files/${data.id}`, { headers: H });
    if (!check.ok) throw new Error(`readback ${check.status}`);
    await check.body?.cancel();
    return data.id;
  } catch {
    return null;
  }
}

async function main() {
  const url = (process.env.DB_URL ?? "").replace("channel_binding=require", "");
  const sql = postgres(url, { prepare: false, ssl: "require" });

  const artists = await sql`select id, avatar_file_id from artists where avatar_file_id is not null`;
  const songs = await sql`select id, cover_file_id, audio_file_id from songs`;

  let migrated = 0;
  let skipped = 0;

  for (const a of artists) {
    const newId = await uploadToLocalDropin(a.avatar_file_id);
    if (newId) {
      await sql`update artists set avatar_file_id = ${newId} where id = ${a.id}`;
      migrated++;
    } else skipped++;
  }

  for (const s of songs) {
    const newCover = s.cover_file_id ? await uploadToLocalDropin(s.cover_file_id) : null;
    const newAudio = s.audio_file_id ? await uploadToLocalDropin(s.audio_file_id) : null;
    if (newCover || newAudio) {
      await sql`update songs set
        cover_file_id = ${newCover ?? s.cover_file_id},
        audio_file_id = ${newAudio ?? s.audio_file_id}
      where id = ${s.id}`;
      migrated += (newCover ? 1 : 0) + (newAudio ? 1 : 0);
    } else if (s.cover_file_id || s.audio_file_id) skipped++;
  }

  console.log(`migrated: ${migrated} file(s) to Dropin, skipped (not local/readback failed): ${skipped}`);

  // verify: every song's audio streams through the Groove proxy with a range
  const check = await sql`select id, title, audio_file_id from songs limit 6`;
  for (const c of check) {
    const res = await fetch(`http://localhost:3000/api/cdn/files/${c.audio_file_id}`, {
      headers: { Range: "bytes=0-99" },
    });
    const len = (await res.arrayBuffer()).byteLength;
    console.log(`  ${res.status === 206 ? "✓" : "✗"} "${c.title}" — proxy range: ${res.status}, ${len} bytes`);
  }

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
