/* Check main DB state: user count, roles, songs. */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const url = (process.env.DB_URL ?? "").replace("channel_binding=require", "");
  const sql = postgres(url, { prepare: false, ssl: "require" });

  const users = await sql`select id, name, email, role, created_at from "user" order by created_at`;
  console.log("users:", JSON.stringify(users, null, 1));
  const songs = await sql`select title, genre, duration_sec, plays from songs order by created_at`;
  console.log("songs:", songs.length);
  const artists = await sql`select name, genre from artists`;
  console.log("artists:", JSON.stringify(artists, null, 1));
  await sql.end();
}

main();
