import { randomUUID } from "node:crypto";
import { Router } from "express";
import { createCollaborationService } from "@repo/backend-common";
import { db, roomForScene } from "@repo/db";
import { CreateSceneSchema, UpdateSceneSchema } from "@repo/validations";
import { guestImportRouter } from "./guestImport.js";

type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export const scenesRouter: Router = Router();
scenesRouter.use("/guest-import", guestImportRouter);

/** Overlay the durable sync head for room-backed scenes. */
async function withSyncHead<T extends { id: string; data: unknown }>(
  scene: T,
): Promise<T> {
  try {
    const attached = await roomForScene(db, scene.id);
    if (!attached) return scene;
    const service = createCollaborationService({ store: db });
    const synced = await service.readSyncScene(scene.id);
    if (!synced) return scene;
    return { ...scene, data: synced.data };
  } catch (error) {
    console.error("Scene sync overlay error:", error);
    return scene;
  }
}

scenesRouter.get("/", async (req, res) => {
  try {
    const scenes = await db
      .orm!.public!.Scene.where({ ownerId: req.userId! })
      .select("id", "title", "createdAt", "updatedAt")
      .orderBy((scene) => scene.updatedAt.desc())
      .all();

    return res.json({ scenes });
  } catch (error) {
    console.error("Scene list error:", error);
    return res.status(500).json({ message: "Unable to list scenes" });
  }
});

scenesRouter.post("/", async (req, res) => {
  const parsed = CreateSceneSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ message: "Invalid scene", issues: parsed.error.issues });
  }

  try {
    const scene = await db.orm!.public!.Scene.create({
      ownerId: req.userId!,
      title: parsed.data.title ?? "Untitled",
      data: parsed.data.data as JsonValue,
    });

    return res.status(201).json({ scene });
  } catch (error) {
    console.error("Scene creation error:", error);
    return res.status(500).json({ message: "Unable to create scene" });
  }
});

scenesRouter.get("/:sceneId", async (req, res) => {
  try {
    const scene = await db
      .orm!.public!.Scene.where({
        id: req.params.sceneId,
        ownerId: req.userId!,
      })
      .first();

    if (!scene) {
      return res.status(404).json({ message: "Scene not found" });
    }

    return res.json({ scene: await withSyncHead(scene) });
  } catch (error) {
    console.error("Scene read error:", error);
    return res.status(500).json({ message: "Unable to load scene" });
  }
});

scenesRouter.patch("/:sceneId", async (req, res) => {
  const parsed = UpdateSceneSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ message: "Invalid scene update", issues: parsed.error.issues });
  }

  try {
    const existing = await db
      .orm!.public!.Scene.where({
        id: req.params.sceneId,
        ownerId: req.userId!,
      })
      .first();

    if (!existing) {
      return res.status(404).json({ message: "Scene not found" });
    }

    const update = {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
    } as {
      title?: string;
      data?: JsonValue;
    };

    // A scene attached to a room is shared state: merge through the same
    // collaboration authority as WS commits instead of overwriting.
    if (parsed.data.data !== undefined) {
      const attached = await roomForScene(db, existing.id);
      if (attached) {
        const data = parsed.data.data as {
          elements?: unknown;
          appState?: unknown;
          files?: unknown;
        };
        const service = createCollaborationService({ store: db });
        const result = await service.applyCommit({
          sceneId: existing.id,
          userId: req.userId!,
          role: "owner",
          elements: data.elements ?? [],
          mutationId: `http-${randomUUID()}`,
          appState: data.appState,
          files: data.files,
        });
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
          return res.status(503).json({ message: "Unable to update scene" });
      } else {
        update.data = parsed.data.data as JsonValue;
      }
    }
    if (parsed.data.title !== undefined || update.data !== undefined) {
      await db
        .orm!.public!.Scene.where({ id: existing.id, ownerId: req.userId! })
        .update(update);
    }

    const scene = await db
      .orm!.public!.Scene.where({ id: existing.id, ownerId: req.userId! })
      .first();

    if (!scene) {
      return res.status(404).json({ message: "Scene not found" });
    }

    return res.json({ scene: await withSyncHead(scene) });
  } catch (error) {
    console.error("Scene update error:", error);
    return res.status(500).json({ message: "Unable to update scene" });
  }
});

scenesRouter.delete("/:sceneId", async (req, res) => {
  try {
    const existing = await db
      .orm!.public!.Scene.where({
        id: req.params.sceneId,
        ownerId: req.userId!,
      })
      .first();

    if (!existing) {
      return res.status(404).json({ message: "Scene not found" });
    }

    const room = await db
      .orm!.public!.Room.where({ sceneId: existing.id })
      .first();
    if (room) {
      return res
        .status(409)
        .json({
          message: "Delete the scene's room before deleting this scene",
        });
    }

    await db
      .orm!.public!.Scene.where({ id: existing.id, ownerId: req.userId! })
      .delete();

    return res.status(204).end();
  } catch (error) {
    console.error("Scene delete error:", error);
    return res.status(500).json({ message: "Unable to delete scene" });
  }
});
