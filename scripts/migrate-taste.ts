import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const url = (process.env.DB_URL ?? "").replace("channel_binding=require", "");
  const sql = postgres(url, { prepare: false, ssl: "require" });
  await sql`
    create table if not exists taste_profiles (
      user_id text primary key references "user"(id) on delete cascade,
      profile jsonb not null,
      computed_at timestamptz not null default now()
    )`;
  const [row] = await sql`select count(*)::int as n from taste_profiles`;
  console.log("taste_profiles ready, rows:", row.n);
  await sql.end();
}
main();
