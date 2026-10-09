import dotenv from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "@prisma/orm-postgres/runtime";
import { Pool } from "pg";
import type { Contract } from "./contract.js";
import contractJson from "./contract.json" with { type: "json" };

// Services run with their own working directories under Turborepo. Load a
// service-local .env first, then the workspace .env for shared credentials.
dotenv.config({
  path: [
    resolve(process.cwd(), ".env"),
    fileURLToPath(new URL("../../../../.env", import.meta.url)),
  ],
  quiet: true,
});

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) throw new Error("DATABASE_URL must be configured.");

export const db = postgres<Contract>({
  contractJson,
  url: databaseUrl,
});

// Better Auth's built-in PostgreSQL adapter requires a pg Pool. Keep it next
// to the Prisma runtime so application packages never initialize databases.
export const authPool = new Pool({ connectionString: databaseUrl });
// Idle connections can be terminated by the database (sleeping tiers,
// network blips). A pool-level error must never crash the service; the
// failing query itself still rejects and is handled at the call site.
authPool.on("error", (error) => {
  console.error("Database pool idle-client error:", error);
});

export async function connectDatabase() {
  await Promise.all([db.connect(), authPool.query("SELECT 1")]);
}

export async function connectApplicationDatabase() {
  await db.connect();
}

export {
  getRoomSceneAccess,
  hasSyncHistory,
  insertSceneRevision,
  pruneSceneRevisions,
  readLegacySceneData,
  readSyncHead,
  roomForScene,
} from "./sceneSync.js";
export type {
  RoomSceneAccess,
  RoomSceneRole,
  RevisionHead,
  SyncDb,
} from "./sceneSync.js";
