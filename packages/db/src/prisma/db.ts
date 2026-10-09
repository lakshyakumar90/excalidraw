import dotenv from "dotenv";
import postgres from "@prisma/orm-postgres/runtime";
import { Pool } from "pg";
import type { Contract } from "./contract.js";
import contractJson from "./contract.json" with { type: "json" };

dotenv.config();

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) throw new Error("DATABASE_URL must be configured.");

export const db = postgres<Contract>({
  contractJson,
  url: databaseUrl,
});

// Better Auth's built-in PostgreSQL adapter requires a pg Pool. Keep it next
// to the Prisma runtime so application packages never initialize databases.
export const authPool = new Pool({ connectionString: databaseUrl });

export async function connectDatabase() {
  await Promise.all([db.connect(), authPool.query("SELECT 1")]);
}
