import { sql } from "@vercel/postgres";
import { drizzle } from "drizzle-orm/vercel-postgres";
import * as schema from "./schema";

// Ensure POSTGRES_URL is set
if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
  throw new Error(
    "POSTGRES_URL or DATABASE_URL environment variable is required"
  );
}

// Create database instance
// @vercel/postgres sql automatically reads from POSTGRES_URL or DATABASE_URL
export const db = drizzle(sql, { schema });

// Re-export schema
export * from "./schema";
