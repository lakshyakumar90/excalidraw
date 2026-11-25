import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Router } from "express";
import { db, getRoomSceneAccess, type RoomSceneRole } from "@repo/db";

export interface RoomApiTokenRecord {
  id: string;
  roomId: number;
  sceneId: string;
  tokenHash: string;
  role: RoomSceneRole;
  label: string;
  expiresAt: string;
  revokedAt: string | null;
  createdById: string;
  createdAt: string;
}

function tokens() {
  return db.orm!.public!.RoomApiToken;
}

export function hashRoomApiToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function createRoomApiToken(input: {
  roomId: number;
  sceneId: string;
  role?: RoomSceneRole;
  label?: string;
  expiresInHours?: number;
  createdById: string;
}): { token: string; record: RoomApiTokenRecord } {
  const rawSecret = `excal_mcp_${randomBytes(24).toString("base64url")}`;
  const tokenHash = hashRoomApiToken(rawSecret);
  const hours = Math.max(1, Math.min(24 * 90, input.expiresInHours ?? 24 * 7));
  const now = Date.now();
  const record: RoomApiTokenRecord = {
    id: randomUUID(),
    roomId: input.roomId,
    sceneId: input.sceneId,
    tokenHash,
    role: input.role ?? "editor",
    label: input.label?.trim() || "MCP Agent Token",
    expiresAt: new Date(now + hours * 3_600_000).toISOString(),
    revokedAt: null,
    createdById: input.createdById,
    createdAt: new Date(now).toISOString(),
  };
  return { token: rawSecret, record };
}

export async function verifyRoomApiToken(rawToken: string): Promise<RoomApiTokenRecord | null> {
  if (!rawToken || rawToken.length < 12) return null;
  const record = await tokens().where({ tokenHash: hashRoomApiToken(rawToken) }).first();
  if (!record || record.revokedAt || Date.parse(record.expiresAt) <= Date.now()) return null;
  if (record.role !== "editor" && record.role !== "viewer") return null;
  const access = await getRoomSceneAccess(db, record.roomId, record.createdById);
  if (access?.role !== "owner" || access.sceneId !== record.sceneId) return null;
  return { ...record, label: record.label ?? "MCP Agent Token", role: record.role };
}

export const mcpTokensRouter: Router = Router();

mcpTokensRouter.get("/:roomId", async (req, res) => {
  const roomId = Number(req.params.roomId);
  if (!Number.isSafeInteger(roomId) || roomId <= 0) {
    res.status(400).json({ error: "Invalid roomId." });
    return;
  }
  const access = req.userId && await getRoomSceneAccess(db, roomId, req.userId);
  if (!access || access.role !== "owner") {
    res.status(403).json({ error: "Room ownership is required." });
    return;
  }
  const records = await tokens().where({ roomId }).orderBy((row) => row.createdAt.desc()).all();
  res.json({ tokens: records.map(({ tokenHash: _hidden, ...record }) => record) });
});

mcpTokensRouter.post("/", async (req, res) => {
  const { roomId, role, label, expiresInHours } = (req.body ?? {}) as {
    roomId?: unknown;
    role?: unknown;
    label?: unknown;
    expiresInHours?: unknown;
  };
  const parsedRoomId = Number(roomId);
  if (!Number.isSafeInteger(parsedRoomId) || parsedRoomId <= 0) {
    res.status(400).json({ error: "Valid numeric roomId is required." });
    return;
  }
  const userId = req.userId;
  const access = userId && await getRoomSceneAccess(db, parsedRoomId, userId);
  if (!userId || !access || access.role !== "owner") {
    res.status(403).json({ error: "Room ownership is required." });
    return;
  }
  const parsedRole: RoomSceneRole =
    role === "viewer" ? "viewer" : "editor";

  const { token, record } = createRoomApiToken({
    roomId: parsedRoomId,
    sceneId: access.sceneId,
    role: parsedRole,
    label: typeof label === "string" ? label : undefined,
    expiresInHours:
      typeof expiresInHours === "number" && Number.isFinite(expiresInHours)
        ? expiresInHours
        : undefined,
    createdById: userId,
  });
  await tokens().create(record);

  const { tokenHash: _hidden, ...safeRecord } = record;
  res.status(201).json({ token, record: safeRecord });
});

mcpTokensRouter.delete("/:tokenId", async (req, res) => {
  const tokenId = String(req.params.tokenId ?? "");
  const token = await tokens().where({ id: tokenId }).first();
  const access = token && req.userId && await getRoomSceneAccess(db, token.roomId, req.userId);
  if (!access || access.role !== "owner") {
    res.status(404).json({ error: "Token not found." });
    return;
  }
  await tokens().where({ id: tokenId }).update({ revokedAt: new Date().toISOString() });
  res.json({ revoked: true, tokenId });
});
