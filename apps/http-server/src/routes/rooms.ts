import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Router } from "express";
import { InviteSchema, RoomSchema, UpdateSceneSchema } from "@repo/validations";
import { authPool } from "../database.js";

export const roomsRouter: Router = Router();
const roomIdOf = (value: string) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};
const codeHash = (code: string) =>
  createHash("sha256").update(code).digest("hex");

roomsRouter.get("/", async (req, res) => {
  try {
    const { rows } = await authPool.query(
      `SELECT r."id", r."slug", r."sceneId", r."adminId",
              CASE WHEN r."adminId" = $1 THEN 'owner' ELSE m."role" END AS "role"
       FROM "room" r LEFT JOIN "roomMember" m ON m."roomId" = r."id" AND m."userId" = $1
       WHERE r."adminId" = $1 OR m."userId" = $1 ORDER BY r."updatedAt" DESC`,
      [req.userId],
    );
    return res.json({ rooms: rows });
  } catch (error) {
    console.error("Room list error:", error);
    return res.status(500).json({ message: "Unable to list rooms" });
  }
});

roomsRouter.get("/:roomId", async (req, res) => {
  const roomId = roomIdOf(req.params.roomId);
  if (!roomId) return res.status(404).json({ message: "Room not found" });
  try {
    const { rows } = await authPool.query(
      `SELECT r."id", r."slug", r."adminId", m."role", s."id" AS "sceneId", s."title", s."data", s."createdAt", s."updatedAt"
       FROM "room" r LEFT JOIN "roomMember" m ON m."roomId" = r."id" AND m."userId" = $2
       LEFT JOIN "scene" s ON s."id" = r."sceneId"
       WHERE r."id" = $1 AND (r."adminId" = $2 OR m."userId" = $2)`,
      [roomId, req.userId],
    );
    const room = rows[0];
    if (!room) return res.status(404).json({ message: "Room not found" });
    return res.json({
      roomId: room.id,
      name: room.slug,
      role: room.adminId === req.userId ? "owner" : room.role,
      scene: room.sceneId
        ? {
            id: room.sceneId,
            title: room.title,
            data: room.data,
            createdAt: room.createdAt,
            updatedAt: room.updatedAt,
          }
        : null,
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
    const result = await authPool.query(
      `UPDATE "scene" s SET "data" = $3, "updatedAt" = NOW()
       FROM "room" r LEFT JOIN "roomMember" m ON m."roomId" = r."id" AND m."userId" = $2
       WHERE r."id" = $1 AND s."id" = r."sceneId"
         AND (r."adminId" = $2 OR (m."userId" = $2 AND m."role" IN ('owner', 'editor')))
       RETURNING s."id"`,
      [roomId, req.userId, parsed.data.data],
    );
    if (!result.rowCount)
      return res.status(404).json({ message: "Editable room not found" });
    return res.status(204).end();
  } catch (error) {
    console.error("Room scene update error:", error);
    return res.status(500).json({ message: "Unable to save room scene" });
  }
});

roomsRouter.post("/", async (req, res) => {
  const parsed = RoomSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid room" });
  const client = await authPool.connect();
  try {
    await client.query("BEGIN");
    const scene = await client.query(
      `SELECT "id" FROM "scene" WHERE "id" = $1 AND "ownerId" = $2 FOR UPDATE`,
      [parsed.data.sceneId, req.userId],
    );
    if (!scene.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Scene not found" });
    }
    const attached = await client.query(
      `SELECT "id" FROM "room" WHERE "sceneId" = $1`,
      [parsed.data.sceneId],
    );
    if (attached.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Scene already has a room" });
    }
    const result = await client.query(
      `INSERT INTO "room" ("slug", "adminId", "sceneId", "updatedAt") VALUES ($1, $2, $3, NOW()) RETURNING "id"`,
      [parsed.data.name, req.userId, parsed.data.sceneId],
    );
    const roomId = result.rows[0].id as number;
    await client.query(
      `INSERT INTO "roomMember" ("userId", "roomId", "role") VALUES ($1, $2, 'owner')`,
      [req.userId, roomId],
    );
    await client.query("COMMIT");
    return res.status(201).json({ roomId });
  } catch (error) {
    await client.query("ROLLBACK");
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
  } finally {
    client.release();
  }
});

roomsRouter.post("/:roomId/invites", async (req, res) => {
  const roomId = roomIdOf(req.params.roomId);
  if (!roomId) return res.status(404).json({ message: "Room not found" });
  const parsed = InviteSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ message: "Invalid invitation" });
  try {
    const owner = await authPool.query(
      `SELECT "id" FROM "room" WHERE "id" = $1 AND "adminId" = $2`,
      [roomId, req.userId],
    );
    if (!owner.rowCount)
      return res.status(404).json({ message: "Room not found" });
    const code = randomBytes(32).toString("hex");
    await authPool.query(
      `INSERT INTO "invite" ("id", "codeHash", "email", "roomId", "expiresAt") VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days')`,
      [randomUUID(), codeHash(code), parsed.data.email.toLowerCase(), roomId],
    );
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
  const client = await authPool.connect();
  try {
    await client.query("BEGIN");
    const invite = await client.query(
      `SELECT i."id", i."roomId" FROM "invite" i JOIN "user" u ON LOWER(u."email") = i."email"
       WHERE i."codeHash" = $1 AND u."id" = $2 AND i."usedAt" IS NULL AND i."expiresAt" > NOW() FOR UPDATE OF i`,
      [codeHash(code), req.userId],
    );
    if (!invite.rowCount) {
      await client.query("ROLLBACK");
      return res
        .status(404)
        .json({ message: "Invitation unavailable for this account" });
    }
    const { id, roomId } = invite.rows[0];
    await client.query(
      `INSERT INTO "roomMember" ("userId", "roomId", "role") VALUES ($1, $2, 'editor') ON CONFLICT ("userId", "roomId") DO NOTHING`,
      [req.userId, roomId],
    );
    await client.query(`UPDATE "invite" SET "usedAt" = NOW() WHERE "id" = $1`, [
      id,
    ]);
    await client.query("COMMIT");
    return res.json({ roomId });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Invitation acceptance error:", error);
    return res.status(500).json({ message: "Unable to accept invitation" });
  } finally {
    client.release();
  }
});

roomsRouter.get("/:roomId/members", async (req, res) => {
  const roomId = roomIdOf(req.params.roomId);
  if (!roomId) return res.status(404).json({ message: "Room not found" });
  try {
    const access = await authPool.query(
      `SELECT 1 FROM "room" r LEFT JOIN "roomMember" m ON m."roomId" = r."id" AND m."userId" = $2 WHERE r."id" = $1 AND (r."adminId" = $2 OR m."userId" = $2)`,
      [roomId, req.userId],
    );
    if (!access.rowCount)
      return res.status(404).json({ message: "Room not found" });
    const { rows } = await authPool.query(
      `SELECT u."id", u."name", u."email", m."role" FROM "roomMember" m JOIN "user" u ON u."id" = m."userId" WHERE m."roomId" = $1 ORDER BY m."joinedAt"`,
      [roomId],
    );
    return res.json({ members: rows });
  } catch (error) {
    console.error("Room members error:", error);
    return res.status(500).json({ message: "Unable to list members" });
  }
});

roomsRouter.delete("/:roomId/members/:userId", async (req, res) => {
  const roomId = roomIdOf(req.params.roomId);
  if (!roomId) return res.status(404).json({ message: "Room not found" });
  try {
    const result = await authPool.query(
      `DELETE FROM "roomMember" m USING "room" r
       WHERE m."roomId" = r."id" AND r."id" = $1 AND r."adminId" = $2
         AND m."userId" = $3 AND m."userId" <> r."adminId" RETURNING m."id"`,
      [roomId, req.userId, req.params.userId],
    );
    if (!result.rowCount)
      return res.status(404).json({ message: "Member not found" });
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
    const { rows } = await authPool.query(
      `SELECT i."id", i."email", i."expiresAt", i."usedAt"
       FROM "invite" i JOIN "room" r ON r."id" = i."roomId"
       WHERE r."id" = $1 AND r."adminId" = $2 ORDER BY i."createdAt" DESC`,
      [roomId, req.userId],
    );
    return res.json({ invites: rows });
  } catch (error) {
    console.error("Invitation list error:", error);
    return res.status(500).json({ message: "Unable to list invitations" });
  }
});

roomsRouter.delete("/:roomId/invites/:inviteId", async (req, res) => {
  const roomId = roomIdOf(req.params.roomId);
  if (!roomId) return res.status(404).json({ message: "Room not found" });
  try {
    const result = await authPool.query(
      `DELETE FROM "invite" i USING "room" r
       WHERE i."roomId" = r."id" AND r."id" = $1 AND r."adminId" = $2 AND i."id" = $3 RETURNING i."id"`,
      [roomId, req.userId, req.params.inviteId],
    );
    if (!result.rowCount)
      return res.status(404).json({ message: "Invitation not found" });
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
    const result = await authPool.query(
      `DELETE FROM "room" WHERE "id" = $1 AND "adminId" = $2 RETURNING "id"`,
      [roomId, req.userId],
    );
    if (!result.rowCount)
      return res.status(404).json({ message: "Room not found" });
    return res.status(204).end();
  } catch (error) {
    console.error("Room deletion error:", error);
    return res.status(500).json({ message: "Unable to delete room" });
  }
});
