import type { Point } from "@repo/common";
import type { CanvasContextMenuAction } from "@/components/canvas/CanvasContextMenu";
import { selectionController } from "@/lib/selection/selectionController";
import { selectionStore } from "@/lib/selection/selectionStore";
import { scene } from "@/lib/scene/scene";
import { historyStore } from "@/lib/history/historyStore";
import { commitHistoryEntry } from "@/lib/sync/commits";

export function runContextMenuAction(
  action: CanvasContextMenuAction,
  scenePoint: Point,
): void {
  switch (action) {
    case "paste":
      void selectionController.pasteFromClipboard(scenePoint);
      break;
    case "select-all":
      selectionController.selectAll();
      break;
    case "cut":
      void selectionController.copySelectionToClipboard().then((copied) => {
        if (copied) selectionController.deleteSelection();
      });
      break;
    case "copy":
      void selectionController.copySelectionToClipboard();
      break;
    case "duplicate":
      selectionController.duplicateSelection();
      break;
    case "group":
      selectionController.groupSelection();
      break;
    case "ungroup":
      selectionController.ungroupSelection();
      break;
    case "backward":
    case "forward":
    case "back":
    case "front": {
      const { changes } = historyStore.commitUpdate(() =>
        scene.reorderElements(selectionStore.getSnapshot(), action),
      );
      commitHistoryEntry(changes, "local");
      break;
    }
    case "delete":
      selectionController.deleteSelection();
      break;
  }
}
