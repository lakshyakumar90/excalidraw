import { createHash, randomInt } from "node:crypto";
import type { Request, Response } from "express";
import { createCollaborationService } from "@repo/backend-common";
import { db, roomOwnedBy } from "@repo/db";
import { checkInvitationRateLimit } from "../invitationRateLimit.js";

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export const syncService = () => createCollaborationService({ store: db });

export function toCommitRole(role: string): "owner" | "editor" | null {
  return role === "owner" || role === "editor" ? role : null;
}

/** Serve the durable head for synced room scenes, legacy data otherwise. */
export async function readRoomSceneData(sceneId: string): Promise<unknown> {
  const synced = await syncService().readSyncScene(sceneId);
  if (synced) return synced.data;
  const scene = await db.orm!.public!.Scene.where({ id: sceneId }).first();
  return scene ? scene.data : null;
}

export const roomIdOf = (value: string) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const codeHash = (code: string) =>
  createHash("sha256").update(code).digest("hex");

export { codeHash };

const isUniqueConflict = (error: unknown) =>
  Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23505",
  );

export { isUniqueConflict };

export interface AccessibleRoom {
  room: {
    id: number;
    slug: string;
    sceneId: string | null;
    adminId: string;
    updatedAt: string;
  };
  role: string;
}

export async function accessibleRoom(
  roomId: number,
  userId: string,
): Promise<AccessibleRoom | null> {
  const room = await db.orm!.public!.Room.where({ id: roomId }).first();
  if (!room) return null;
  const member = await db
    .orm!.public!.RoomMember.where({ roomId, userId })
    .first();
  if (room.adminId !== userId && !member) return null;
  return { room, role: room.adminId === userId ? "owner" : member!.role };
}

export async function ownedRoom(
  roomId: number,
  userId: string,
): Promise<{ slug: string } | null> {
  const room = await roomOwnedBy(db, roomId, userId);
  return room ? { slug: room.slug } : null;
}

const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function createJoinCode(): string {
  return Array.from(
    { length: 6 },
    () => JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)],
  ).join("");
}

export function canonicalWebOrigin(): string {
  return (process.env.WEB_ORIGIN ?? "http://localhost:3000").replace(/\/$/, "");
}

export async function applyInviteRateLimit(
  req: Request,
  res: Response,
  bucket: string,
  subject: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  try {
    const result = await checkInvitationRateLimit({
      bucket,
      subject,
      limit,
      windowMs,
    });
    if (result.allowed) return true;
    res.setHeader(
      "Retry-After",
      String(Math.max(1, Math.ceil(result.retryAfterMs / 1000))),
    );
    res
      .status(429)
      .json({ message: "Too many invitations. Try again shortly." });
    return false;
  } catch {
    res.status(503).json({ message: "Invitation service is unavailable" });
    return false;
  }
}
