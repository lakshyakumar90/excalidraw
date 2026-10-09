import "dotenv/config";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL must be configured for the HTTP server.");
}

export const authPool = new Pool({ connectionString: databaseUrl });
