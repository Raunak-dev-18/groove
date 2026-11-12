/* v2 migration: region columns for the 5-day onboarding engine. Idempotent. */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const url = (process.env.DB_URL ?? "").replace("channel_binding=require", "");
  const sql = postgres(url, { prepare: false, ssl: "require" });
  await sql`alter table "user" add column if not exists country text`;
  await sql`alter table artists add column if not exists country text`;
  console.log("v2 migration complete (user.country, artists.country)");
  await sql.end();
}
main();
