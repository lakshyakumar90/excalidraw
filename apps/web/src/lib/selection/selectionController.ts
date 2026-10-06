/*
This controller has four pointer behaviors:
- Click an element to select it.
- Drag a selected element to move it. If several elements are selected, they move together.
- Drag on empty canvas to select elements whose bounds overlap the marquee. Shift-drag adds those elements to the current selection.
- Dragging a resize handle resizes one element, with rotation, Shift, and Alt support.
*/

import type { Element, Point } from "@repo/common";
import { elementIntersectsRect, getElementAtPosition } from "@repo/engine";
import { scene } from "@/lib/scene/scene";
import {
  getResizeCursor,
  getResizeHandleAtPosition,
  type ResizeHandle,
} from "./handles";
import { resizeElement } from "./resize";
import { selectionStore } from "./selectionStore";

export interface MarqueePreview {
  start: Point;
  current: Point;
}

type Gesture =
  | { kind: "idle" }
  | {
      kind: "marquee";
      start: Point;
      current: Point;
      zoom: number;
      shiftKey: boolean;
      selectionAtStart: string[];
    }
  | {
      kind: "move";
      start: Point;
      elements: Array<{ id: string; x: number; y: number }>;
    }
  | {
      kind: "resize";
      original: Element;
      handle: ResizeHandle;
    };

let gesture: Gesture = { kind: "idle" };

const MIN_MARQUEE_PIXELS = 3;

export const selectionController = {
  getCursor(point: Point, zoom: number): string {
    if (gesture.kind === "resize") {
      return getResizeCursor(
        gesture.handle,
        gesture.original.angle ?? 0,
      );
    }

    if (gesture.kind === "move") return "grabbing";

    const selectedIds = [...selectionStore.getSnapshot()];
    if (selectedIds.length !== 1) return "default";

    const selectedElement = scene.getElement(selectedIds[0]!);
    if (!selectedElement || selectedElement.isDeleted) return "default";

    const handle = getResizeHandleAtPosition(selectedElement, point, zoom);
    return handle
      ? getResizeCursor(handle, selectedElement.angle ?? 0)
      : "default";
  },

  pointerDown(point: Point, shiftKey: boolean, zoom: number): void {
    // Check handles before checking for an element under the pointer. Otherwise
    // a handle sitting on the element edge would start a move instead.
    const selectedIds = [...selectionStore.getSnapshot()];

    if (selectedIds.length === 1) {
      const selectedElement = scene.getElement(selectedIds[0]!);

      if (selectedElement && !selectedElement.isDeleted) {
        const handle = getResizeHandleAtPosition(
          selectedElement,
          point,
          zoom,
        );

        if (handle) {
          gesture = {
            kind: "resize",
            original: cloneElement(selectedElement),
            handle,
          };
          return;
        }
      }
    }

    const hit = getElementAtPosition(scene.getElements(), point, zoom);

    if (!hit) {
      const selectionAtStart = [...selectionStore.getSnapshot()];

      if (!shiftKey) {
        selectionStore.clear();
      }

      gesture = {
        kind: "marquee",
        start: point,
        current: point,
        zoom,
        shiftKey,
        selectionAtStart: shiftKey ? selectionAtStart : [],
      };

      return;
    }

    const wasSelected = selectionStore.getSnapshot().has(hit.id);

    if (shiftKey && wasSelected) {
      // Shift-click on a selected element removes it from the selection.
      selectionStore.toggle(hit.id);
      gesture = { kind: "idle" };
      return;
    }

    if (shiftKey) {
      // Shift-click adds this element and keeps the existing selection.
      selectionStore.toggle(hit.id);
    } else if (!wasSelected) {
      // Preserve a multi-selection when starting a drag on one of its members.
      selectionStore.set([hit.id]);
    }

    const elements = [...selectionStore.getSnapshot()]
      .map((id) => scene.getElement(id))
      .filter((element) => element !== undefined && !element.isDeleted)
      .map((element) => ({
        id: element.id,
        x: element.x,
        y: element.y,
      }));

    gesture = {
      kind: "move",
      start: point,
      elements,
    };
  },

  pointerMove(point: Point, shiftKey: boolean, altKey: boolean): void {
    if (gesture.kind === "marquee") {
      gesture = {
        ...gesture,
        current: point,
      };
      return;
    }

    if (gesture.kind === "resize") {
      const resized = resizeElement(
        gesture.original,
        gesture.handle,
        point,
        shiftKey,
        altKey,
      );

      scene.mutateElement(
        gesture.original.id,
        resized as Partial<Omit<Element, "id" | "type">>,
      );
      return;
    }

    if (gesture.kind !== "move") return;

    const dx = point.x - gesture.start.x;
    const dy = point.y - gesture.start.y;

    if (dx === 0 && dy === 0) return;

    for (const element of gesture.elements) {
      scene.mutateElement(element.id, {
        x: element.x + dx,
        y: element.y + dy,
      });
    }
  },

  pointerUp(point: Point, shiftKey: boolean, altKey: boolean): void {
    if (gesture.kind === "move" || gesture.kind === "resize") {
      this.pointerMove(point, shiftKey, altKey);
    }

    if (gesture.kind === "marquee") {
      const dragDistance = Math.hypot(
        point.x - gesture.start.x,
        point.y - gesture.start.y,
      );

      // A short click on empty canvas clears selection; it shouldn't select
      // an element just because its bounds happen to contain the pointer.
      if (dragDistance >= MIN_MARQUEE_PIXELS / gesture.zoom) {
        const rect = {
          minX: Math.min(gesture.start.x, point.x),
          minY: Math.min(gesture.start.y, point.y),
          maxX: Math.max(gesture.start.x, point.x),
          maxY: Math.max(gesture.start.y, point.y),
        };

        const marqueeIds = scene
          .getElements()
          .filter((element) => elementIntersectsRect(element, rect))
          .map((element) => element.id);

        selectionStore.set(
          gesture.shiftKey
            ? new Set([...gesture.selectionAtStart, ...marqueeIds])
            : marqueeIds,
        );
      }
    }

    gesture = { kind: "idle" };
  },

  getMarquee(): MarqueePreview | null {
    if (gesture.kind !== "marquee") return null;

    return {
      start: gesture.start,
      current: gesture.current,
    };
  },
};

function cloneElement(element: Element): Element {
  if ("points" in element) {
    return {
      ...element,
      points: element.points.map((point) => ({ ...point })),
    } as Element;
  }

  return { ...element };
}
