//This uses the hit-testing code. Because that function checks elements from top to bottom, overlapping elements select the one drawn on top.

import type { Point } from "@repo/common";
import { getElementAtPosition } from "@repo/engine";
import { scene } from "@/lib/scene/scene";
import { selectionStore } from "./selectionStore";

export const selectionController = {
  selectAt(point: Point, shiftKey: boolean, zoom: number): void {
    const hit = getElementAtPosition(scene.getElements(), point, zoom);

    if (!hit) {
      // Clicking empty canvas clears the current selection.
      selectionStore.clear();
      return;
    }

    if (shiftKey) {
      // Shift-click adds an unselected element or removes a selected one.
      selectionStore.toggle(hit.id);
      return;
    }

    // A regular click selects just the element under the pointer.
    selectionStore.set([hit.id]);
  },
};