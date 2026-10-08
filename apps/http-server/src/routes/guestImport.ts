import { createHash } from "node:crypto";
import { Router } from "express";
import { db } from "@repo/db";
import { CreateSceneSchema } from "@repo/validations";
import { z } from "zod";

export const guestImportRouter: Router = Router();
const keySchema = z.string().regex(/^[a-f0-9]{64}$/);
const importSchema = CreateSceneSchema.extend({ importKey: keySchema });

// A stable, account-specific primary key makes retries atomic without changing
// the scene schema. Updates to the imported scene never change this identity.
function sceneId(userId: string, key: string) {
  return `guest_${createHash("sha256")
    .update(JSON.stringify([userId, key]))
    .digest("hex")}`;
}

guestImportRouter.get("/:key", async (req, res) => {
  const key = keySchema.safeParse(req.params.key);
  if (!key.success)
    return res.status(400).json({ message: "Invalid import key" });
  try {
    const scene = await db
      .orm!.public!.Scene.where({
        id: sceneId(req.userId!, key.data),
        ownerId: req.userId!,
      })
      .first();
    return res.json({ scene: scene ?? null });
  } catch (error) {
    console.error("Guest import lookup error:", error);
    return res
      .status(500)
      .json({ message: "Could not check the guest import" });
  }
});

guestImportRouter.post("/", async (req, res) => {
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ message: "Invalid guest drawing" });
  const id = sceneId(req.userId!, parsed.data.importKey);
  const find = () =>
    db.orm!.public!.Scene.where({ id, ownerId: req.userId! }).first();
  try {
    const existing = await find();
    if (existing) return res.json({ scene: existing });
    try {
      const scene = await db.orm!.public!.Scene.create({
        id,
        ownerId: req.userId!,
        title: parsed.data.title ?? "Guest drawing",
        data: z.json().parse(parsed.data.data),
      });
      return res.status(201).json({ scene });
    } catch (error) {
      // Another tab may have inserted the same key while this request waited.
      const existing = await find();
      if (existing) return res.json({ scene: existing });
      throw error;
    }
  } catch (error) {
    console.error("Guest import error:", error);
    return res
      .status(500)
      .json({ message: "Could not save the guest drawing" });
  }
});
