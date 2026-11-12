/* Add playlists table for user-created playlists (like Spotify). Idempotent. */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const url = (process.env.DB_URL ?? "").replace("channel_binding=require", "");
  const sql = postgres(url, { prepare: false, ssl: "require" });

  await sql`
    create table if not exists playlists (
      id uuid primary key default gen_random_uuid(),
      user_id text not null references "user"(id) on delete cascade,
      name text not null,
      cover_file_id text,
      created_at timestamptz not null default now()
    )`;

  await sql`
    create table if not exists playlist_songs (
      id uuid primary key default gen_random_uuid(),
      playlist_id uuid not null references playlists(id) on delete cascade,
      song_id uuid not null references songs(id) on delete cascade,
      added_at timestamptz not null default now(),
      unique(playlist_id, song_id)
    )`;

  console.log("playlists tables ready");
  await sql.end();
}
main();
