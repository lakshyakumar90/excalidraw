import { createHash, randomInt, randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { issuePresenceTicket } from "@repo/auth";
import {
  isRoomInviteDeliveryConfigured,
  issueRoomInviteToken,
  sendRoomInvitationEmail,
  verifyRoomInviteToken,
} from "@repo/auth/room-invitation";
import { createCollaborationService } from "@repo/backend-common";
import {
  acceptEmailRoomInvite,
  acceptRoomJoinCode,
  changeRoomMemberRole,
  createOrGetSceneRoom,
  createRoomInvite,
  createRoomJoinCode,
  listRoomInvites,
  listRoomJoinCodes,
  markInviteSent,
  prepareRoomInviteResend,
  recordInviteDelivery,
  removeRoomMember,
  revokeEmailRoomInvite,
  revokeRoomJoinCode,
  roomOwnedBy,
  db,
} from "@repo/db";
import {
  InviteSchema,
  JoinCodeSchema,
  RoomJoinCodeInputSchema,
  RoomSchema,
  UpdateRoomMemberSchema,
  UpdateSceneSchema,
} from "@repo/validations";
import {
  checkInvitationRateLimit,
  publishRoomAccessChanged,
} from "../invitationRateLimit.js";

const syncService = () => createCollaborationService({ store: db });

function toCommitRole(role: string): "owner" | "editor" | null {
  return role === "owner" || role === "editor" ? role : null;
}

/** Serve the durable head for synced room scenes, legacy data otherwise. */
async function readRoomSceneData(sceneId: string): Promise<unknown> {
  const synced = await syncService().readSyncScene(sceneId);
  if (synced) return synced.data;
  const scene = await db.orm!.public!.Scene.where({ id: sceneId }).first();
  return scene ? scene.data : null;
}

export const roomsRouter: Router = Router();
type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
const roomIdOf = (value: string) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};
const codeHash = (code: string) =>
  createHash("sha256").update(code).digest("hex");
const isUniqueConflict = (error: unknown) =>
  Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505",
  );

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

async function ownedRoom(roomId: number, userId: string) {
  return roomOwnedBy(db, roomId, userId);
}

const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function createJoinCode(): string {
  return Array.from(
    { length: 6 },
    () => JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)],
  ).join("");
}

function canonicalWebOrigin(): string {
  return (process.env.WEB_ORIGIN ?? "http://localhost:3000").replace(/\/$/, "");
}

async function applyInviteRateLimit(
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
    res.status(429).json({ message: "Too many invitations. Try again shortly." });
    return false;
  } catch {
    res.status(503).json({ message: "Invitation service is unavailable" });
    return false;
  }
}

roomsRouter.get("/", async (req, res) => {
  try {
    const owned = await db
      .orm!.public!.Room.where({ adminId: req.userId! })
      .select("id", "slug", "sceneId", "adminId", "updatedAt")
      .all();
    const memberships = await db
      .orm!.public!.RoomMember.where({ userId: req.userId! })
      .include("room")
      .all();
    const rooms = new Map<
      number,
      {
        id: number;
        slug: string;
        sceneId: string | null;
        adminId: string;
        role: string;
        updatedAt: string;
      }
    >();
    for (const room of owned) rooms.set(room.id, { ...room, role: "owner" });
    for (const member of memberships) {
      if (!rooms.has(member.roomId)) {
        const { id, slug, sceneId, adminId, updatedAt } = member.room;
        rooms.set(id, {
          id,
          slug,
          sceneId,
          adminId,
          updatedAt,
          role: member.role,
        });
      }
    }
    return res.json({
      rooms: [...rooms.values()].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
    });
  } catch (error) {
    console.error("Room list error:", error);
    return res.status(500).json({ message: "Unable to list rooms" });
  }
});

roomsRouter.get("/:roomId", async (req, res) => {
  const roomId = roomIdOf(req.params.roomId);
  if (!roomId) return res.status(404).json({ message: "Room not found" });
  try {
    const access = await accessibleRoom(roomId, req.userId!);
    if (!access) return res.status(404).json({ message: "Room not found" });
    const sceneRow = access.room.sceneId
      ? await db.orm!.public!.Scene.where({ id: access.room.sceneId }).first()
      : null;
    const scene =
      sceneRow && access.room.sceneId
        ? { ...sceneRow, data: await readRoomSceneData(access.room.sceneId) }
        : sceneRow;
    return res.json({
      roomId,
      name: access.room.slug,
      role: access.role,
      scene,
    });
  } catch (error) {
    console.error("Room read error:", error);
    return res.status(500).json({ message: "Unable to load room" });
  }
});

roomsRouter.post("/:roomId/presence-ticket", async (req, res) => {
  const roomId = roomIdOf(req.params.roomId);
  if (!roomId) return res.status(404).json({ message: "Room not found" });
  try {
    // The caller never supplies a user ID: it comes from the validated
    // session, and the ticket below is the only WebSocket credential.
    // Tickets are short-lived and kept in memory by the browser.
    const access = await accessibleRoom(roomId, req.userId!);
    if (!access) return res.status(404).json({ message: "Room not found" });
    const ticket = issuePresenceTicket({ userId: req.userId!, roomId });
    return res.json({ ticket });
  } catch (error) {
    console.error("Presence ticket error:", error);
    return res.status(500).json({ message: "Unable to issue presence ticket" });
  }
});

roomsRouter.patch("/:roomId/scene", async (req, res) => {
  const roomId = roomIdOf(req.params.roomId);
  if (!roomId) return res.status(404).json({ message: "Room not found" });
  const parsed = UpdateSceneSchema.safeParse(req.body);
  if (!parsed.success || !parsed.data.data || parsed.data.title !== undefined)
    return res.status(400).json({ message: "Invalid scene update" });
  try {
    const access = await accessibleRoom(roomId, req.userId!);
    if (!access?.room.sceneId || access.role === "viewer")
      return res.status(404).json({ message: "Editable room not found" });
    // Room-backed writes merge through the shared collaboration authority
    // instead of replacing the whole document: concurrent editors keep
    // each other's committed elements.
    const role = toCommitRole(access.role);
    if (!role) return res.status(404).json({ message: "Editable room not found" });
    const data = parsed.data.data as {
      elements?: unknown;
      appState?: unknown;
      files?: unknown;
    };
    const result = await syncService().applyCommit({
      sceneId: access.room.sceneId,
      userId: req.userId!,
      role,
      elements: data.elements ?? [],
      mutationId: `http-${randomUUID()}`,
      appState: data.appState,
      files: data.files,
    });
    if (!result.saved && result.reason === "missing-scene")
      return res.status(404).json({ message: "Editable room not found" });
    if (!result.saved && result.missingFiles)
      return res.status(409).json({
        message: "Upload image files before saving",
        missingFiles: result.missingFiles,
      });
    if (!result.saved && result.reason === "invalid")
      return res.status(400).json({ message: "Invalid scene update" });
    if (!result.saved && result.reason === "too-large")
      return res.status(413).json({ message: "Scene update too large" });
    if (!result.saved)
      return res.status(503).json({ message: "Unable to save room scene" });
    return res.json({ revision: result.revision });
  } catch (error) {
    console.error("Room scene update error:", error);
    return res.status(500).json({ message: "Unable to save room scene" });
  }
});

roomsRouter.post("/:roomId/files", async (req, res) => {
  const roomId = roomIdOf(req.params.roomId);
  if (!roomId) return res.status(404).json({ message: "Room not found" });
  const body = req.body as { fileId?: unknown; file?: unknown };
  if (typeof body?.fileId !== "string" || body.fileId.length === 0) {
    return res.status(400).json({ message: "Invalid file upload" });
  }
  try {
    const access = await accessibleRoom(roomId, req.userId!);
    if (!access?.room.sceneId || access.role === "viewer")
      return res.status(404).json({ message: "Editable room not found" });
    const role = toCommitRole(access.role);
    if (!role) return res.status(404).json({ message: "Editable room not found" });
    const result = await syncService().attachFile({
      sceneId: access.room.sceneId,
      userId: req.userId!,
      role,
      fileId: body.fileId,
      file: body.file,
    });
    if (!result.saved && result.reason === "missing-scene")
      return res.status(404).json({ message: "Editable room not found" });
    if (!result.saved && result.reason === "invalid")
      return res.status(400).json({ message: "Invalid file upload" });
    if (!result.saved && result.reason === "too-large")
      return res.status(413).json({ message: "File upload too large" });
    if (!result.saved)
      return res.status(503).json({ message: "Unable to save file" });
    return res.json({ revision: result.revision });
  } catch (error) {
    console.error("Room file upload error:", error);
    return res.status(500).json({ message: "Unable to save file" });
  }
});

roomsRouter.get("/:roomId/files/:fileId", async (req, res) => {
  const roomId = roomIdOf(req.params.roomId);
  const fileId = req.params.fileId;
  if (!roomId || !fileId) return res.status(404).json({ message: "File not found" });
  try {
    // Read-only members may fetch referenced bytes to render collaborators'
    // image elements; the file IDs themselves travel over the sync channel.
    const access = await accessibleRoom(roomId, req.userId!);
    if (!access?.room.sceneId)
      return res.status(404).json({ message: "File not found" });
    const data = (await readRoomSceneData(access.room.sceneId)) as {
      files?: Record<string, unknown>;
    } | null;
    const file = data?.files?.[fileId];
    if (!file) return res.status(404).json({ message: "File not found" });
    return res.json({ file });
  } catch (error) {
    console.error("Room file read error:", error);
    return res.status(500).json({ message: "Unable to load file" });
  }
});

roomsRouter.post("/", async (req, res) => {
  const parsed = RoomSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid room" });
  try {
    const roomId = await db.transaction(async (tx) => {
      const scene = await tx
        .orm!.public!.Scene.where({
          id: parsed.data.sceneId,
          ownerId: req.userId!,
        })
        .first();
      if (!scene) return null;
      const attached = await tx
        .orm!.public!.Room.where({ sceneId: scene.id })
        .first();
      if (attached) return "attached";
      const room = await tx.orm!.public!.Room.create({
        slug: parsed.data.name,
        adminId: req.userId!,
        sceneId: scene.id,
      });
      await tx.orm!.public!.RoomMember.create({
        userId: req.userId!,
        roomId: room.id,
        role: "owner",
      });
      return room.id;
    });
    if (roomId === null)
      return res.status(404).json({ message: "Scene not found" });
    if (roomId === "attached")
      return res.status(409).json({ message: "Scene already has a room" });
    return res.status(201).json({ roomId });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    )
      return res
        .status(409)
        .json({ message: "Room name or scene is already in use" });
    console.error("Room creation error:", error);
    return res.status(500).json({ message: "Unable to create room" });
  }
});

roomsRouter.post("/share", async (req, res) => {
  const parsed = RoomSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid room" });
  try {
    const room = await createOrGetSceneRoom(db, {
      sceneId: parsed.data.sceneId,
      ownerId: req.userId!,
      name: parsed.data.name,
    });
    if (!room) return res.status(404).json({ message: "Scene not found" });
    return res.status(200).json({
      roomId: room.roomId,
      role: "owner",
      url: `${canonicalWebOrigin()}/room/${room.roomId}/canvas`,
    });
  } catch (error) {
    console.error("Room sharing error:", error);
    return res.status(500).json({ message: "Unable to share this scene" });
  }
});

roomsRouter.post("/:roomId/invites", async (req, res) => {
  const roomId = roomIdOf(req.params.roomId);
  if (!roomId) return res.status(404).json({ message: "Room not found" });
  const parsed = InviteSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ message: "Invalid invitation" });
  try {
    if (!(await ownedRoom(roomId, req.userId!)))
      return res.status(404).json({ message: "Room not found" });
    if (
      !(await applyInviteRateLimit(
        req,
        res,
        "invite-owner-minute",
        req.userId!,
        10,
        60_000,
      )) ||
      !(await applyInviteRateLimit(
        req,
        res,
        "invite-room-hour",
        String(roomId),
        50,
        60 * 60_000,
      ))
    ) return;
    const inviteId = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const email = parsed.data.email;
    const token = issueRoomInviteToken({
      inviteId,
      roomId,
      email,
      role: parsed.data.role,
      expiresAt,
    });
    await createRoomInvite(db, {
      id: inviteId,
      codeHash: codeHash(token),
      email,
      role: parsed.data.role,
      roomId,
      expiresAt,
    });
    const url = `${canonicalWebOrigin()}/invite/${encodeURIComponent(token)}`;
    const sent = await sendRoomInvitationEmail({
      to: email,
      roomName: (await ownedRoom(roomId, req.userId!))?.slug ?? "Shared room",
      inviterName: "The room owner",
      role: parsed.data.role,
      expiresAt,
      url,
    });
    if (sent) await markInviteSent(db, inviteId);
    else
      await recordInviteDelivery(db, {
        id: inviteId,
        error: isRoomInviteDeliveryConfigured()
          ? "delivery-failed"
          : "not-configured",
      });
    return res.status(201).json({
      inviteId,
      roomId,
      email,
      role: parsed.data.role,
      expiresAt,
      inviteUrl: url,
      delivery: sent ? "sent" : isRoomInviteDeliveryConfigured() ? "failed" : "manual-link",
    });
  } catch (error) {
    console.error("Invitation creation error:", error);
    return res.status(500).json({ message: "Unable to create invitation" });
  }
});

roomsRouter.post("/:roomId/invites/:inviteId/resend", async (req, res) => {
  const roomId = roomIdOf(req.params.roomId);
  if (!roomId) return res.status(404).json({ message: "Room not found" });
  try {
    if (!(await ownedRoom(roomId, req.userId!)))
      return res.status(404).json({ message: "Room not found" });
    if (
      !(await applyInviteRateLimit(
        req,
        res,
        "invite-owner-minute",
        req.userId!,
        10,
        60_000,
      ))
    ) return;
    const existing = await db.orm!.public!.Invite.where({
      id: req.params.inviteId,
      roomId,
    }).first();
    if (!existing)
      return res.status(404).json({ message: "Invitation unavailable" });
    const token = issueRoomInviteToken({
      inviteId: existing.id,
      roomId,
      email: existing.email,
      role: existing.role as "editor" | "viewer",
      expiresAt: existing.expiresAt,
    });
    const invite = await prepareRoomInviteResend(db, {
      roomId,
      inviteId: existing.id,
      ownerId: req.userId!,
      codeHash: codeHash(token),
    });
    if (!invite)
      return res.status(409).json({ message: "Invitation is unavailable" });
    const url = `${canonicalWebOrigin()}/invite/${encodeURIComponent(token)}`;
    const sent = await sendRoomInvitationEmail({
      to: invite.email,
      roomName: invite.roomName,
      inviterName: "The room owner",
      role: invite.role as "editor" | "viewer",
      expiresAt: invite.expiresAt,
      url,
    });
    if (sent) await markInviteSent(db, invite.id);
    else
      await recordInviteDelivery(db, {
        id: invite.id,
        error: isRoomInviteDeliveryConfigured()
          ? "delivery-failed"
          : "not-configured",
      });
    return res.json({
      inviteUrl: url,
      delivery: sent ? "sent" : isRoomInviteDeliveryConfigured() ? "failed" : "manual-link",
    });
  } catch (error) {
    console.error("Invitation resend error:", error);
    return res.status(500).json({ message: "Unable to resend invitation" });
  }
});

roomsRouter.post("/invites/:code/accept", async (req, res) => {
  const code = req.params.code;
  const legacy = /^[a-f0-9]{64}$/i.test(code);
  let claims: ReturnType<typeof verifyRoomInviteToken> | null = null;
  if (!legacy) {
    try {
      claims = verifyRoomInviteToken(code);
    } catch {
      return res.status(404).json({ message: "Invitation unavailable" });
    }
  }
  try {
    if (
      !(await applyInviteRateLimit(
        req,
        res,
        "invite-accept-user",
        `${req.userId}:${req.ip}`,
        10,
        60_000,
      ))
    ) return;
    const accepted = await acceptEmailRoomInvite(db, {
      codeHash: codeHash(code),
      userId: req.userId!,
      ...(claims
        ? {
            inviteId: claims.inviteId,
            roomId: claims.roomId,
            email: claims.email,
            role: claims.role,
          }
        : {}),
    });
    if (!accepted)
      return res
        .status(404)
        .json({ message: "Invitation unavailable for this account" });
    return res.json({ roomId: accepted.roomId, role: accepted.role });
  } catch (error) {
    console.error("Invitation acceptance error:", error);
    return res.status(500).json({ message: "Unable to accept invitation" });
  }
});

roomsRouter.post("/join-codes/:code/accept", async (req, res) => {
  const parsed = RoomJoinCodeInputSchema.safeParse(req.params.code);
  if (!parsed.success)
    return res.status(404).json({ message: "Invitation unavailable" });
  try {
    if (
      !(await applyInviteRateLimit(
        req,
        res,
        "join-code-accept-user",
        `${req.userId}:${req.ip}`,
        10,
        60_000,
      ))
    ) return;
    const accepted = await acceptRoomJoinCode(db, {
      codeHash: codeHash(parsed.data),
      userId: req.userId!,
    });
    if (!accepted)
      return res.status(404).json({ message: "Invitation unavailable" });
    return res.json(accepted);
  } catch (error) {
    console.error("Join code acceptance error:", error);
    return res.status(503).json({ message: "Invitation service is unavailable" });
  }
});

roomsRouter.post("/:roomId/join-codes", async (req, res) => {
  const roomId = roomIdOf(req.params.roomId);
  if (!roomId) return res.status(404).json({ message: "Room not found" });
  const parsed = JoinCodeSchema.safeParse(req.body ?? {});
  if (!parsed.success)
    return res.status(400).json({ message: "Invalid join code request" });
  try {
    if (!(await ownedRoom(roomId, req.userId!)))
      return res.status(404).json({ message: "Room not found" });
    if (
      !(await applyInviteRateLimit(
        req,
        res,
        "invite-owner-minute",
        req.userId!,
        10,
        60_000,
      )) ||
      !(await applyInviteRateLimit(
        req,
        res,
        "invite-room-hour",
        String(roomId),
        50,
        60 * 60_000,
      ))
    ) return;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = createJoinCode();
      try {
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const id = randomUUID();
        await createRoomJoinCode(db, {
          id,
          codeHash: codeHash(code),
          role: parsed.data.role,
          roomId,
          expiresAt,
        });
        return res.status(201).json({
          id,
          code,
          role: parsed.data.role,
          expiresAt,
          url: `${canonicalWebOrigin()}/join/${code}`,
        });
      } catch (error) {
        if (!isUniqueConflict(error)) throw error;
      }
    }
    return res.status(503).json({ message: "Could not create a unique join code" });
  } catch (error) {
    console.error("Join code creation error:", error);
    return res.status(500).json({ message: "Unable to create join code" });
  }
});

roomsRouter.get("/:roomId/join-codes", async (req, res) => {
  const roomId = roomIdOf(req.params.roomId);
  if (!roomId) return res.status(404).json({ message: "Room not found" });
  try {
    if (!(await ownedRoom(roomId, req.userId!)))
      return res.status(404).json({ message: "Room not found" });
    const codes = await listRoomJoinCodes(db, roomId);
    return res.json({
      codes: codes.map((code) => ({
        id: code.id,
        role: code.role,
        expiresAt: code.expiresAt,
        createdAt: code.createdAt,
        revokedAt: code.revokedAt,
      })),
    });
  } catch (error) {
    console.error("Join code listing error:", error);
    return res.status(500).json({ message: "Unable to list join codes" });
  }
});

roomsRouter.delete("/:roomId/join-codes/:codeId", async (req, res) => {
  const roomId = roomIdOf(req.params.roomId);
  if (!roomId) return res.status(404).json({ message: "Room not found" });
  try {
    const revoked = await revokeRoomJoinCode(db, {
      roomId,
      codeId: req.params.codeId,
      ownerId: req.userId!,
    });
    if (!revoked)
      return res.status(409).json({ message: "Join code is unavailable" });
    return res.status(204).end();
  } catch (error) {
    console.error("Join code revocation error:", error);
    return res.status(500).json({ message: "Unable to revoke join code" });
  }
});

roomsRouter.get("/:roomId/members", async (req, res) => {
  const roomId = roomIdOf(req.params.roomId);
  if (!roomId) return res.status(404).json({ message: "Room not found" });
  try {
    const access = await accessibleRoom(roomId, req.userId!);
    if (!access)
      return res.status(404).json({ message: "Room not found" });
    const members = await db
      .orm!.public!.RoomMember.where({ roomId })
      .include("user")
      .all();
    return res.json({
      members: members.map((member) => ({
        id: member.userId,
        name: member.user.name,
        ...(access.role === "owner" ? { email: member.user.email } : {}),
        role: member.role,
      })),
    });
  } catch (error) {
    console.error("Room members error:", error);
    return res.status(500).json({ message: "Unable to list members" });
  }
});

roomsRouter.delete("/:roomId/members/:userId", async (req, res) => {
  const roomId = roomIdOf(req.params.roomId);
  if (!roomId) return res.status(404).json({ message: "Room not found" });
  try {
    const removed = await removeRoomMember(db, {
      roomId,
      ownerId: req.userId!,
      userId: req.params.userId,
    });
    if (!removed) return res.status(404).json({ message: "Member not found" });
    try {
      await publishRoomAccessChanged({
        roomId,
        userId: req.params.userId,
        role: null,
      });
    } catch (error) {
      console.error("Room access notification failed after member removal:", error);
    }
    return res.status(204).end();
  } catch (error) {
    console.error("Member removal error:", error);
    return res.status(500).json({ message: "Unable to remove member" });
  }
});

roomsRouter.patch("/:roomId/members/:userId", async (req, res) => {
  const roomId = roomIdOf(req.params.roomId);
  if (!roomId) return res.status(404).json({ message: "Room not found" });
  const parsed = UpdateRoomMemberSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ message: "Invalid member role" });
  try {
    const changed = await changeRoomMemberRole(db, {
      roomId,
      ownerId: req.userId!,
      userId: req.params.userId,
      role: parsed.data.role,
    });
    if (!changed) return res.status(404).json({ message: "Member not found" });
    try {
      await publishRoomAccessChanged({
        roomId,
        userId: req.params.userId,
        role: parsed.data.role,
      });
    } catch (error) {
      console.error("Room access notification failed after role change:", error);
    }
    return res.json({ userId: req.params.userId, role: parsed.data.role });
  } catch (error) {
    console.error("Member role update error:", error);
    return res.status(500).json({ message: "Unable to update member role" });
  }
});

roomsRouter.get("/:roomId/invites", async (req, res) => {
  const roomId = roomIdOf(req.params.roomId);
  if (!roomId) return res.status(404).json({ message: "Room not found" });
  try {
    if (!(await ownedRoom(roomId, req.userId!)))
      return res.status(404).json({ message: "Room not found" });
    const invites = await listRoomInvites(db, roomId);
    return res.json({
      invites: invites.map((invite) => ({
        id: invite.id,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
        usedAt:
          invite.usedAt ??
          (invite.claim?.action === "accepted" ? invite.claim.createdAt : null),
        revokedAt: invite.revokedAt,
        sentAt: invite.sentAt,
        deliveryError: invite.deliveryError,
        createdAt: invite.createdAt,
      })),
    });
  } catch (error) {
    console.error("Invitation list error:", error);
    return res.status(500).json({ message: "Unable to list invitations" });
  }
});

roomsRouter.delete("/:roomId/invites/:inviteId", async (req, res) => {
  const roomId = roomIdOf(req.params.roomId);
  if (!roomId) return res.status(404).json({ message: "Room not found" });
  try {
    if (!(await ownedRoom(roomId, req.userId!)))
      return res.status(404).json({ message: "Room not found" });
    const revoked = await revokeEmailRoomInvite(db, {
      roomId,
      inviteId: req.params.inviteId,
      ownerId: req.userId!,
    });
    if (!revoked)
      return res.status(409).json({ message: "Invitation is unavailable" });
    return res.status(204).end();
  } catch (error) {
    console.error("Invitation revocation error:", error);
    return res.status(500).json({ message: "Unable to revoke invitation" });
  }
});

roomsRouter.delete("/:roomId", async (req, res) => {
  const roomId = roomIdOf(req.params.roomId);
  if (!roomId) return res.status(404).json({ message: "Room not found" });
  try {
    if (!(await ownedRoom(roomId, req.userId!)))
      return res.status(404).json({ message: "Room not found" });
    await db
      .orm!.public!.Room.where({ id: roomId, adminId: req.userId! })
      .delete();
    return res.status(204).end();
  } catch (error) {
    console.error("Room deletion error:", error);
    return res.status(500).json({ message: "Unable to delete room" });
  }
});
