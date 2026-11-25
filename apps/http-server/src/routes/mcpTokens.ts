import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Router } from "express";
import type { RoomSceneRole } from "@repo/db";

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

const tokensById = new Map<string, RoomApiTokenRecord>();
const tokenIdByHash = new Map<string, string>();

export function hashRoomApiToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function mintRoomApiToken(input: {
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
  tokensById.set(record.id, record);
  tokenIdByHash.set(tokenHash, record.id);
  return { token: rawSecret, record };
}

export function verifyRoomApiToken(rawToken: string): RoomApiTokenRecord | null {
  if (!rawToken || rawToken.length < 12) return null;
  const hash = hashRoomApiToken(rawToken);
  const id = tokenIdByHash.get(hash);
  if (!id) return null;
  const record = tokensById.get(id);
  if (!record) return null;
  if (record.revokedAt) return null;
  if (Date.parse(record.expiresAt) <= Date.now()) return null;
  return record;
}

export function revokeRoomApiToken(tokenId: string): boolean {
  const record = tokensById.get(tokenId);
  if (!record) return false;
  record.revokedAt = new Date().toISOString();
  return true;
}

export function listRoomApiTokens(roomId: number): Omit<RoomApiTokenRecord, "tokenHash">[] {
  const results: Omit<RoomApiTokenRecord, "tokenHash">[] = [];
  for (const record of tokensById.values()) {
    if (record.roomId !== roomId) continue;
    const { tokenHash: _hidden, ...safe } = record;
    results.push(safe);
  }
  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const mcpTokensRouter: Router = Router();

mcpTokensRouter.get("/:roomId", (req, res) => {
  const roomId = Number(req.params.roomId);
  if (!Number.isSafeInteger(roomId) || roomId <= 0) {
    res.status(400).json({ error: "Invalid roomId." });
    return;
  }
  res.json({ tokens: listRoomApiTokens(roomId) });
});

mcpTokensRouter.post("/", (req, res) => {
  const { roomId, sceneId, role, label, expiresInHours } = (req.body ?? {}) as {
    roomId?: unknown;
    sceneId?: unknown;
    role?: unknown;
    label?: unknown;
    expiresInHours?: unknown;
  };
  const parsedRoomId = Number(roomId);
  if (!Number.isSafeInteger(parsedRoomId) || parsedRoomId <= 0) {
    res.status(400).json({ error: "Valid numeric roomId is required." });
    return;
  }
  const parsedSceneId =
    typeof sceneId === "string" && sceneId.trim().length > 0
      ? sceneId.trim()
      : `room-${parsedRoomId}`;
  const parsedRole: RoomSceneRole =
    role === "viewer" || role === "editor" || role === "owner" ? role : "editor";

  const { token, record } = mintRoomApiToken({
    roomId: parsedRoomId,
    sceneId: parsedSceneId,
    role: parsedRole,
    label: typeof label === "string" ? label : undefined,
    expiresInHours:
      typeof expiresInHours === "number" && Number.isFinite(expiresInHours)
        ? expiresInHours
        : undefined,
    createdById: req.userId ?? "system",
  });

  const { tokenHash: _hidden, ...safeRecord } = record;
  res.status(201).json({ token, record: safeRecord });
});

mcpTokensRouter.delete("/:tokenId", (req, res) => {
  const tokenId = String(req.params.tokenId ?? "");
  const ok = revokeRoomApiToken(tokenId);
  if (!ok) {
    res.status(404).json({ error: "Token not found." });
    return;
  }
  res.json({ revoked: true, tokenId });
});
