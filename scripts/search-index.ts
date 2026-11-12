import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const url = (process.env.DB_URL ?? "").replace("channel_binding=require", "");
  const sql = postgres(url, { prepare: false, ssl: "require" });

  // trigram extension powers fast substring (ILIKE '%…%') search
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;

  await sql`CREATE INDEX IF NOT EXISTS idx_songs_title_trgm ON songs USING gin (title gin_trgm_ops)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_songs_description_trgm ON songs USING gin (description gin_trgm_ops)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_artists_name_trgm ON artists USING gin (name gin_trgm_ops)`;

  const idx = await sql`
    select indexname from pg_indexes
    where tablename in ('songs','artists') and indexname like '%trgm%'`;
  console.log("indexes created:", idx.map((i) => i.indexname));
  await sql.end();
}
main();
