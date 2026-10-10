import { randomUUID } from "node:crypto";
import { Router } from "express";
import { issuePresenceTicket } from "@repo/auth";
import { createOrGetSceneRoom, db } from "@repo/db";
import { RoomSchema, UpdateSceneSchema } from "@repo/validations";
import {
  accessibleRoom,
  canonicalWebOrigin,
  ownedRoom,
  readRoomSceneData,
  roomIdOf,
  syncService,
  toCommitRole,
} from "./roomRouteUtils.js";
import { registerRoomInviteRoutes } from "./roomInvites.js";

export const roomsRouter: Router = Router();
export { accessibleRoom } from "./roomRouteUtils.js";
export type { AccessibleRoom } from "./roomRouteUtils.js";
type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

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
    if (!role)
      return res.status(404).json({ message: "Editable room not found" });
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
    if (!role)
      return res.status(404).json({ message: "Editable room not found" });
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
  if (!roomId || !fileId)
    return res.status(404).json({ message: "File not found" });
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

registerRoomInviteRoutes(roomsRouter);

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
