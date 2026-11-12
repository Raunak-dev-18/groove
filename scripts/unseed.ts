/* Wipe seed content: artists (cascades songs) + orphaned local uploads. */
import { config } from "dotenv";
config({ path: ".env.local" });
import { promises as fs } from "fs";
import path from "path";
import postgres from "postgres";

const url = (process.env.DB_URL ?? "").replace("channel_binding=require", "");
const sql = postgres(url, { prepare: false, ssl: "require" });

async function main() {
  await sql`truncate "artists", "songs" cascade`;
  await sql.end();
  console.log("artists/songs truncated");

  // clean local uploads that are now unreferenced
  const dir = path.join(process.cwd(), "data", "uploads");
  try {
    await fs.rm(dir, { recursive: true, force: true });
    console.log("local uploads cleared");
  } catch {
    /* no dir */
  }
}
main();
