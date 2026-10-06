import { HistoryManager } from "@repo/engine";
import { scene } from "@/lib/scene/scene";
import { selectionStore } from "@/lib/selection/selectionStore";

export const historyStore = new HistoryManager(
  scene,
  () => selectionStore.getSnapshot(),
  (ids) => selectionStore.set(ids),
);
