import { Router } from "express";
import { libraryRepository } from "@repo/db";
import { validateLibraryStamp } from "@repo/common";

export interface LibraryRepository {
  list(
    ownerId: string,
  ): PromiseLike<{ id: string; name: string; updatedAt: string }[]>;
  get(ownerId: string, id: string): PromiseLike<unknown | null>;
  create(ownerId: string, name: string, data: unknown): PromiseLike<unknown>;
  rename(ownerId: string, id: string, name: string): PromiseLike<unknown>;
  remove(ownerId: string, id: string): PromiseLike<unknown>;
}
export function createLibraryRouter(
  repository: LibraryRepository = libraryRepository,
): Router {
  const router = Router();
  const name = (value: unknown) =>
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= 100
      ? value.trim()
      : null;
  router.get("/", async (req, res) => {
    try {
      const all = await repository.list(req.userId!);
      const offset = Math.max(0, Math.min(200, Number(req.query.offset) || 0));
      return res.json({
        items: all.slice(offset, offset + 30),
        nextOffset: offset + 30 < all.length ? offset + 30 : null,
      });
    } catch {
      return res.status(500).json({ message: "Could not load your library" });
    }
  });
  router.get("/:id", async (req, res) => {
    try {
      const item = await repository.get(req.userId!, String(req.params.id));
      return item
        ? res.json({ item })
        : res.status(404).json({ message: "Library item not found" });
    } catch {
      return res.status(500).json({ message: "Could not load this stamp" });
    }
  });
  router.post("/", async (req, res) => {
    const label = name(req.body?.name);
    if (!label || !validateLibraryStamp(req.body?.data))
      return res.status(400).json({
        message:
          "Invalid stamp or missing image files (maximum 20 MB / 1,000 elements)",
      });
    try {
      if ((await repository.list(req.userId!)).length >= 200)
        return res
          .status(409)
          .json({ message: "Your library is full (200 stamps)" });
      const item = await repository.create(req.userId!, label, req.body.data);
      return res.status(201).json({ item });
    } catch {
      return res.status(500).json({ message: "Could not save your stamp" });
    }
  });
  router.patch("/:id", async (req, res) => {
    const label = name(req.body?.name);
    if (!label)
      return res
        .status(400)
        .json({ message: "Enter a name of 1–100 characters" });
    try {
      const id = String(req.params.id);
      if (!(await repository.get(req.userId!, id)))
        return res.status(404).json({ message: "Library item not found" });
      await repository.rename(req.userId!, id, label);
      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ message: "Could not rename your stamp" });
    }
  });
  router.delete("/:id", async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await repository.get(req.userId!, id)))
        return res.status(404).json({ message: "Library item not found" });
      await repository.remove(req.userId!, id);
      return res.status(204).end();
    } catch {
      return res.status(500).json({ message: "Could not remove your stamp" });
    }
  });
  return router;
}
export const libraryRouter = createLibraryRouter();
