import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "@repo/db";
import { createCollaborationService } from "@repo/backend-common";

export const revisionsRouter: Router = Router();

interface RevisionSummary {
  revision: number;
  actorId: string;
  createdAt: string;
  elementCount: number;
}

/**
 * GET /api/revisions/:sceneId
 * Lists the most recent 20 SceneRevision snapshots for a scene.
 */
revisionsRouter.get("/:sceneId", async (req, res) => {
  const sceneId = String(req.params.sceneId ?? "").trim();
  const userId = req.userId;
  if (!sceneId || !userId) {
    res.status(400).json({ error: "Invalid sceneId." });
    return;
  }

  try {
    const scene = await db.orm!.public!.Scene.where({ id: sceneId }).first();
    if (!scene) {
      res.status(404).json({ error: "Scene not found." });
      return;
    }

    const allRows = await db.orm!.public!.SceneRevision.where({ sceneId })
      .orderBy((r) => r.revision.desc())
      .all();
    const rows = allRows.slice(0, 20);

    const revisions: RevisionSummary[] = rows.map((row) => {
      const data = row.data as { elements?: unknown[] } | null;
      const elements = Array.isArray(data?.elements) ? data.elements : [];
      const activeCount = elements.filter(
        (el) =>
          typeof el === "object" &&
          el !== null &&
          !(el as { isDeleted?: boolean }).isDeleted,
      ).length;
      return {
        revision: Number(row.revision),
        actorId: String(row.actorId ?? ""),
        createdAt: String(row.createdAt ?? new Date().toISOString()),
        elementCount: activeCount,
      };
    });

    res.json({ sceneId, revisions });
  } catch (error) {
    console.error("Failed to list scene revisions:", error);
    res.status(500).json({ error: "Could not load version history." });
  }
});

/**
 * POST /api/revisions/:sceneId/:revision/restore
 * Restores a historical SceneRevision as a brand-new revision through the
 * collaboration authority so all connected WebSocket peers converge in real time.
 */
revisionsRouter.post("/:sceneId/:revision/restore", async (req, res) => {
  const sceneId = String(req.params.sceneId ?? "").trim();
  const targetRevision = Number(req.params.revision);
  const userId = req.userId;
  if (!sceneId || !userId || !Number.isSafeInteger(targetRevision) || targetRevision < 0) {
    res.status(400).json({ error: "Invalid sceneId or revision." });
    return;
  }

  try {
    const targetRow = await db.orm!.public!.SceneRevision.where({
      sceneId,
      revision: targetRevision,
    }).first();
    if (!targetRow) {
      res.status(404).json({ error: "Revision not found." });
      return;
    }

    const snapshotData = targetRow.data as {
      elements?: Record<string, unknown>[];
      appState?: Record<string, unknown>;
      files?: Record<string, unknown>;
    } | null;

    const now = Date.now();
    const restoredElements = (
      Array.isArray(snapshotData?.elements) ? snapshotData.elements : []
    ).map((el) => ({
      ...el,
      version: Number((el as { version?: number }).version ?? 1) + 1000,
      versionNonce: Math.floor(Math.random() * 2_000_000_000),
      updated: now,
    }));

    const collab = createCollaborationService({ store: db });
    const result = await collab.applyCommit({
      sceneId,
      userId,
      role: "owner",
      elements: restoredElements,
      appState: snapshotData?.appState,
      files: snapshotData?.files,
      mutationId: `restore-${targetRevision}-${randomUUID()}`,
    });

    if (!result.saved) {
      res.status(409).json({ error: result.reason ?? "Could not restore revision." });
      return;
    }

    res.json({
      restoredFrom: targetRevision,
      newRevision: result.revision,
      elementCount: restoredElements.length,
    });
  } catch (error) {
    console.error("Failed to restore scene revision:", error);
    res.status(500).json({ error: "Could not restore revision." });
  }
});
