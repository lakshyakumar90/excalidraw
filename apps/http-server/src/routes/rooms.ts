import { Router } from "express";
import { RoomSchema } from "@repo/validations";
import { db } from "@repo/db";

export const roomsRouter: Router = Router();

roomsRouter.get("/:roomId", async (req, res) => {
  const roomId = Number(req.params.roomId);
  if (!Number.isSafeInteger(roomId) || roomId < 1) {
    return res.status(404).json({ message: "Room not found" });
  }

  try {
    const room = await db.orm!.public!.Room.where({ id: roomId }).first();
    if (!room) return res.status(404).json({ message: "Room not found" });

    if (room.adminId !== req.userId) {
      const membership = await db
        .orm!.public!.RoomMember.where({ roomId, userId: req.userId! })
        .first();
      if (!membership)
        return res.status(404).json({ message: "Room not found" });
    }

    const sceneRecord = room.sceneId
      ? await db.orm!.public!.Scene.where({ id: room.sceneId }).first()
      : null;

    return res.json({
      roomId: room.id,
      scene: sceneRecord,
    });
  } catch (error) {
    console.error("Room read error:", error);
    return res.status(500).json({ message: "Unable to load room" });
  }
});

roomsRouter.post("/", async (req, res) => {
  try {
    const result = RoomSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json(result.error);
    }

    const room = await db.orm?.public?.Room.create({
      slug: result.data.name,
      adminId: req.userId!,
    });

    if (!room) {
      return res.status(500).json({ message: "Failed to create room" });
    }

    return res.json({
      message: "Room created successfully",
      roomId: room.id,
    });
  } catch (error) {
    console.error("Room creation error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});
