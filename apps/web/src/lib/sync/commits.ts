import type { CommitOrigin, SceneElementChange } from "@repo/engine";
import { scene } from "@/lib/scene/scene";

/**
 * Promote a finished history capture to exactly one durable version per
 * changed ID. Call once per user action (gesture end, discrete action,
 * undo/redo) — never per pointermove. The resulting commit event feeds the
 * sync outbox (room scenes) and stays local-only otherwise.
 */
export function commitHistoryEntry(
  changes: readonly SceneElementChange[],
  origin: CommitOrigin,
): void {
  if (changes.length === 0) return;
  scene.commitChanges(
    changes.map((change) => change.id),
    origin,
  );
}

/** Commit the changed IDs returned by HistoryManager.undo()/redo(). */
export function commitUndoRedo(ids: readonly string[], kind: "undo" | "redo"): void {
  if (ids.length === 0) return;
  scene.commitChanges(ids, kind);
}
