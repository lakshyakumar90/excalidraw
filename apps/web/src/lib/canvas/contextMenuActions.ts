import type { Point } from "@repo/common";
import type { CanvasContextMenuAction } from "@/components/canvas/CanvasContextMenu";
import { selectionController } from "@/lib/selection/selectionController";
import { selectionStore } from "@/lib/selection/selectionStore";
import { scene } from "@/lib/scene/scene";

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
    case "front":
      scene.reorderElements(selectionStore.getSnapshot(), action);
      break;
    case "delete":
      selectionController.deleteSelection();
      break;
  }
}
