import { config } from "dotenv";
import type { Config } from "drizzle-kit";

config({ path: ".env.local" });
config({ path: ".env" });

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: (process.env.DB_URL ?? "").replace("channel_binding=require", ""),
  },
} satisfies Config;
