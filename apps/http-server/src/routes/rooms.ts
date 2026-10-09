import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Router } from "express";
import { db } from "@repo/db";
import { InviteSchema, RoomSchema, UpdateSceneSchema } from "@repo/validations";

export const roomsRouter: Router = Router();
type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
const roomIdOf = (value: string) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};
const codeHash = (code: string) =>
  createHash("sha256").update(code).digest("hex");

async function accessibleRoom(roomId: number, userId: string) {
  const room = await db.orm!.public!.Room.where({ id: roomId }).first();
  if (!room) return null;
  const member = await db
    .orm!.public!.RoomMember.where({ roomId, userId })
    .first();
  if (room.adminId !== userId && !member) return null;
  return { room, role: room.adminId === userId ? "owner" : member!.role };
}

async function ownedRoom(roomId: number, userId: string) {
  return db.orm!.public!.Room.where({ id: roomId, adminId: userId }).first();
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
    const scene = access.room.sceneId
      ? await db.orm!.public!.Scene.where({ id: access.room.sceneId }).first()
      : null;
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
    await db
      .orm!.public!.Scene.where({ id: access.room.sceneId })
      .update({ data: parsed.data.data as JsonValue });
    return res.status(204).end();
  } catch (error) {
    console.error("Room scene update error:", error);
    return res.status(500).json({ message: "Unable to save room scene" });
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

roomsRouter.post("/:roomId/invites", async (req, res) => {
  const roomId = roomIdOf(req.params.roomId);
  if (!roomId) return res.status(404).json({ message: "Room not found" });
  const parsed = InviteSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ message: "Invalid invitation" });
  try {
    if (!(await ownedRoom(roomId, req.userId!)))
      return res.status(404).json({ message: "Room not found" });
    const code = randomBytes(32).toString("hex");
    await db.orm!.public!.Invite.create({
      id: randomUUID(),
      codeHash: codeHash(code),
      email: parsed.data.email.toLowerCase(),
      roomId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    return res
      .status(201)
      .json({ code, roomId, email: parsed.data.email.toLowerCase() });
  } catch (error) {
    console.error("Invitation creation error:", error);
    return res.status(500).json({ message: "Unable to create invitation" });
  }
});

roomsRouter.post("/invites/:code/accept", async (req, res) => {
  const code = req.params.code;
  if (!/^[a-f0-9]{64}$/.test(code))
    return res.status(404).json({ message: "Invitation not found" });
  try {
    const roomId = await db.transaction(async (tx) => {
      const invite = await tx
        .orm!.public!.Invite.where({ codeHash: codeHash(code), usedAt: null })
        .first();
      const user = await tx
        .orm!.public!.User.where({ id: req.userId! })
        .first();
      if (
        !invite ||
        !user ||
        invite.email !== user.email.toLowerCase() ||
        Date.parse(invite.expiresAt) <= Date.now()
      )
        return null;
      const claimed = await tx
        .orm!.public!.Invite.where({ id: invite.id, usedAt: null })
        .update({ usedAt: new Date().toISOString() });
      if (!claimed || (Array.isArray(claimed) && claimed.length === 0))
        return null;
      const member = await tx
        .orm!.public!.RoomMember.where({
          userId: req.userId!,
          roomId: invite.roomId,
        })
        .first();
      if (!member)
        await tx.orm!.public!.RoomMember.create({
          userId: req.userId!,
          roomId: invite.roomId,
          role: "editor",
        });
      return invite.roomId;
    });
    if (!roomId)
      return res
        .status(404)
        .json({ message: "Invitation unavailable for this account" });
    return res.json({ roomId });
  } catch (error) {
    console.error("Invitation acceptance error:", error);
    return res.status(500).json({ message: "Unable to accept invitation" });
  }
});

roomsRouter.get("/:roomId/members", async (req, res) => {
  const roomId = roomIdOf(req.params.roomId);
  if (!roomId) return res.status(404).json({ message: "Room not found" });
  try {
    if (!(await accessibleRoom(roomId, req.userId!)))
      return res.status(404).json({ message: "Room not found" });
    const members = await db
      .orm!.public!.RoomMember.where({ roomId })
      .include("user")
      .all();
    return res.json({
      members: members.map((member) => ({
        id: member.userId,
        name: member.user.name,
        email: member.user.email,
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
    const room = await ownedRoom(roomId, req.userId!);
    if (!room || req.params.userId === room.adminId)
      return res.status(404).json({ message: "Member not found" });
    const member = await db
      .orm!.public!.RoomMember.where({ roomId, userId: req.params.userId })
      .first();
    if (!member) return res.status(404).json({ message: "Member not found" });
    await db.orm!.public!.RoomMember.where({ id: member.id }).delete();
    return res.status(204).end();
  } catch (error) {
    console.error("Member removal error:", error);
    return res.status(500).json({ message: "Unable to remove member" });
  }
});

roomsRouter.get("/:roomId/invites", async (req, res) => {
  const roomId = roomIdOf(req.params.roomId);
  if (!roomId) return res.status(404).json({ message: "Room not found" });
  try {
    if (!(await ownedRoom(roomId, req.userId!)))
      return res.status(404).json({ message: "Room not found" });
    const invites = await db
      .orm!.public!.Invite.where({ roomId })
      .select("id", "email", "expiresAt", "usedAt", "createdAt")
      .orderBy((invite) => invite.createdAt.desc())
      .all();
    return res.json({ invites });
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
    const invite = await db
      .orm!.public!.Invite.where({ id: req.params.inviteId, roomId })
      .first();
    if (!invite)
      return res.status(404).json({ message: "Invitation not found" });
    await db.orm!.public!.Invite.where({ id: invite.id, roomId }).delete();
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
