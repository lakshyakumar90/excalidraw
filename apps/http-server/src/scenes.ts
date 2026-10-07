import { Router } from "express";
import { db } from "@repo/db";
import { CreateSceneSchema, UpdateSceneSchema } from "@repo/validations";

type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export const scenesRouter: Router = Router();

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
    const scene = await db
      .orm!.public!.Scene.create({
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

    return res.json({ scene });
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
      ...(parsed.data.data !== undefined
        ? { data: parsed.data.data as JsonValue }
        : {}),
    };
    await db
      .orm!.public!.Scene.where({ id: existing.id, ownerId: req.userId! })
      .update(update);

    const scene = await db
      .orm!.public!.Scene.where({ id: existing.id, ownerId: req.userId! })
      .first();

    if (!scene) {
      return res.status(404).json({ message: "Scene not found" });
    }

    return res.json({ scene });
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

    await db
      .orm!.public!.Scene.where({ id: existing.id, ownerId: req.userId! })
      .delete();

    return res.status(204).end();
  } catch (error) {
    console.error("Scene delete error:", error);
    return res.status(500).json({ message: "Unable to delete scene" });
  }
});
