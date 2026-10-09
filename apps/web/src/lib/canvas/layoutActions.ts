import {
  layoutDeltas,
  selectionClosure,
  type LayoutAction,
} from "@repo/engine";
import { scene } from "@/lib/scene/scene";
import { selectionStore } from "@/lib/selection/selectionStore";
import {
  getMovementSnapshots,
  translateSnapshots,
} from "@/lib/selection/boundElements";
import { historyStore } from "@/lib/history/historyStore";
import { commitHistoryEntry } from "@/lib/sync/commits";

export function applyLayout(action: LayoutAction) {
  const selected = selectionClosure(
    scene.getElements(),
    selectionStore.getSnapshot(),
  );
  const deltas = layoutDeltas(selected, action);
  if (!deltas.size) return;
  const { changes } = historyStore.commitUpdate(() => {
    const moved = new Set<string>();
    for (const [id, d] of deltas) {
      const e = scene.getElement(id);
      if (!e) continue;
      const snapshots = getMovementSnapshots([e]).filter(
        (s) => !moved.has(s.id),
      );
      for (const s of snapshots) moved.add(s.id);
      translateSnapshots(snapshots, d.x, d.y);
    }
  });
  commitHistoryEntry(changes, "local");
}
