import { defineConfig } from "drizzle-kit";

// Get database URL from environment variables
// Try multiple common variable names
const databaseUrl = 
  process.env.POSTGRES_URL || 
  process.env.DATABASE_URL || 
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING;

if (!databaseUrl) {
  throw new Error(
    "Database connection URL is required. Please set one of the following environment variables:\n" +
    "  - POSTGRES_URL\n" +
    "  - DATABASE_URL\n" +
    "  - POSTGRES_PRISMA_URL\n" +
    "  - POSTGRES_URL_NON_POOLING"
  );
}

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
