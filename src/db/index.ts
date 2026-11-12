import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Neon PostgreSQL (pooled connection string from env).
// channel_binding is a libpq-only param — strip it for postgres.js.
const url = (process.env.DB_URL ?? "").replace("channel_binding=require", "");

const client = postgres(url, {
  prepare: false, // required for Neon's PgBouncer pooler
  ssl: "require",
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle({ client, schema });
export { schema };
