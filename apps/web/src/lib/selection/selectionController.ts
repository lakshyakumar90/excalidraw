/*
This controller owns canvas selection, transforms, and point editing:
- Click an element to select it.
- Drag a selected element to move it. If several elements are selected, they move together.
- Drag on empty canvas to select elements whose bounds overlap the marquee. Shift-drag adds those elements to the current selection.
- Dragging a resize handle resizes one element, with rotation, Shift, and Alt support.
*/

import type { Element, Point } from "@repo/common";
import { elementIntersectsRect, getElementAtPosition, getElementBounds } from "@repo/engine";
import { createTextElement } from "@repo/engine";
import { textEditStore } from "./textEditStore";
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
    }
  | { kind: "point"; elementId: string; pointIndex: number }
  | { kind: "group-resize"; originals: Element[]; bounds: Rect; handle: ResizeHandle };

let gesture: Gesture = { kind: "idle" };
let pointEditingElementId: string | null = null;

const MIN_MARQUEE_PIXELS = 3;

export const selectionController = {
  getCursor(point: Point, zoom: number): string {
    if (gesture.kind === "resize") {
      return getResizeCursor(
        gesture.handle,
        gesture.original.angle ?? 0,
      );
    }

    if (gesture.kind === "group-resize") return getResizeCursor(gesture.handle, 0);

    if (gesture.kind === "move") return "grabbing";
    if (gesture.kind === "point") return "grabbing";

    const selectedIds = [...selectionStore.getSnapshot()];
    if (selectedIds.length > 1) {
      const bounds = getSelectionBounds(selectedIds);
      const handle = bounds && rectHandleAt(bounds, point, zoom);
      if (handle) return getResizeCursor(handle, 0);
    }
    if (selectedIds.length !== 1) return "default";

    const selectedElement = scene.getElement(selectedIds[0]!);
    if (!selectedElement || selectedElement.isDeleted) return "default";

    const handle = getResizeHandleAtPosition(selectedElement, point, zoom);
    return handle
      ? getResizeCursor(handle, selectedElement.angle ?? 0)
      : "default";
  },

  pointerDown(point: Point, shiftKey: boolean, zoom: number): void {
    if (pointEditingElementId) {
      const element = scene.getElement(pointEditingElementId);
      if (element && "points" in element) {
        const nearest = element.points.findIndex((p) =>
          Math.hypot(point.x - element.x - p.x, point.y - element.y - p.y) <= 10 / zoom,
        );
        if (nearest >= 0) {
          gesture = { kind: "point", elementId: element.id, pointIndex: nearest };
          return;
        }
      }
    }
    // Check handles before checking for an element under the pointer. Otherwise
    // a handle sitting on the element edge would start a move instead.
    const selectedIds = [...selectionStore.getSnapshot()];

    if (selectedIds.length > 1) {
      const bounds = getSelectionBounds(selectedIds);
      const handle = bounds && rectHandleAt(bounds, point, zoom);
      if (bounds && handle) {
        gesture = {
          kind: "group-resize",
          originals: selectedIds.map((id) => scene.getElement(id)).filter((e): e is Element => !!e && !e.isDeleted).map(cloneElement),
          bounds,
          handle,
        };
        return;
      }
    }

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
      .filter((element): element is Element => element !== undefined && !element.isDeleted)
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

    if (gesture.kind === "group-resize") {
      const b = gesture.bounds;
      const left = gesture.handle.includes("w"), top = gesture.handle.includes("n");
      const horizontal = gesture.handle.includes("w") || gesture.handle.includes("e");
      const vertical = gesture.handle.includes("n") || gesture.handle.includes("s");
      const anchorX = horizontal ? (left ? b.maxX : b.minX) : (b.minX + b.maxX) / 2;
      const anchorY = vertical ? (top ? b.maxY : b.minY) : (b.minY + b.maxY) / 2;
      const scaleX = horizontal ? (point.x - anchorX) / ((left ? b.minX : b.maxX) - anchorX || 1) : null;
      const scaleY = vertical ? (point.y - anchorY) / ((top ? b.minY : b.maxY) - anchorY || 1) : null;
      const scale = scaleX !== null && scaleY !== null
        ? Math.abs(scaleX) >= Math.abs(scaleY) ? scaleX : scaleY
        : scaleX ?? scaleY ?? 1;
      for (const original of gesture.originals) {
        const nextX = anchorX + (original.x - anchorX) * scale;
        const nextY = anchorY + (original.y - anchorY) * scale;
        const changes: Record<string, unknown> = {
          x: nextX, y: nextY,
          width: (original.width ?? 0) * Math.abs(scale),
          height: (original.height ?? 0) * Math.abs(scale),
          strokeWidth: (original.strokeWidth ?? 1) * Math.abs(scale),
        };
        if (original.type === "text") changes.fontSize = original.fontSize * Math.abs(scale);
        if ("points" in original) changes.points = original.points.map((p) => ({ ...p, x: p.x * scale, y: p.y * scale }));
        scene.mutateElement(original.id, changes as Partial<Omit<Element, "id" | "type">>);
      }
      return;
    }

    if (gesture.kind === "point") {
      const element = scene.getElement(gesture.elementId);
      if (element && "points" in element) {
        const points = element.points.map((p) => ({ ...p }));
        const p = points[gesture.pointIndex];
        if (p) points[gesture.pointIndex] = { ...p, x: point.x - element.x, y: point.y - element.y };
        scene.mutateElement(element.id, { points } as Partial<Omit<Element, "id" | "type">>);
      }
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
    if (gesture.kind === "move" || gesture.kind === "resize" || gesture.kind === "point" || gesture.kind === "group-resize") {
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

  getPointEditingElement(): Element | null {
    const element = pointEditingElementId ? scene.getElement(pointEditingElementId) : undefined;
    return element && !element.isDeleted ? element : null;
  },

  handleDoubleClick(point: Point, zoom: number): void {
    pointEditingElementId = null;
    const element = getElementAtPosition(scene.getElements(), point, zoom);
    if (!element) return;
    selectionStore.set([element.id]);
    if (element.type === "line") pointEditingElementId = element.id;
    if (element.type === "text") {
      textEditStore.open({ targetElementId: element.id, text: element.text, editsShapeLabel: false });
      return;
    }
    if ("points" in element) return;

    const boundText = (element.boundElements ?? [])
      .map((id) => scene.getElement(id))
      .find((candidate): candidate is Extract<Element, { type: "text" }> => candidate?.type === "text" && !candidate.isDeleted);
    textEditStore.open({
      targetElementId: boundText?.id ?? element.id,
      text: boundText?.text ?? "",
      editsShapeLabel: !boundText,
    });
  },

  saveTextEdit(text: string): void {
    const request = textEditStore.getSnapshot();
    if (!request) return;
    const target = scene.getElement(request.targetElementId);
    if (target?.type === "text") {
      scene.mutateElement(target.id, { text } as Partial<Omit<Element, "id" | "type">>);
    } else if (target && request.editsShapeLabel && text.trim()) {
      const bounds = getElementBounds(target);
      const textElement = createTextElement({
        x: bounds.minX,
        y: bounds.minY,
        width: bounds.maxX - bounds.minX,
        height: bounds.maxY - bounds.minY,
        angle: target.angle ?? 0,
        text,
        textAlign: "center",
        verticalAlign: "middle",
      });
      scene.addElement(textElement);
      scene.mutateElement(target.id, { boundElements: [...(target.boundElements ?? []), textElement.id] } as Partial<Omit<Element, "id" | "type">>);
    }
    textEditStore.close();
  },

  cancelTextEdit(): void {
    textEditStore.close();
  },

  exitPointEditing(): boolean {
    if (!pointEditingElementId) return false;
    pointEditingElementId = null;
    gesture = { kind: "idle" };
    return true;
  },

  selectAll(): void {
    selectionStore.set(scene.getElements().filter((element) => !element.isDeleted).map((element) => element.id));
  },

  deleteSelection(): void {
    for (const id of selectionStore.getSnapshot()) scene.mutateElement(id, { isDeleted: true });
    selectionStore.clear();
  },

  nudgeSelection(dx: number, dy: number): void {
    for (const id of selectionStore.getSnapshot()) {
      const element = scene.getElement(id);
      if (element && !element.isDeleted) scene.mutateElement(id, { x: element.x + dx, y: element.y + dy });
    }
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

type Rect = { minX: number; minY: number; maxX: number; maxY: number };
function getSelectionBounds(ids: readonly string[]): Rect | null {
  const elements = ids.map((id) => scene.getElement(id)).filter((e): e is Element => !!e && !e.isDeleted);
  if (!elements.length) return null;
  const bounds = elements.map(getElementBounds);
  return { minX: Math.min(...bounds.map((b) => b.minX)), minY: Math.min(...bounds.map((b) => b.minY)), maxX: Math.max(...bounds.map((b) => b.maxX)), maxY: Math.max(...bounds.map((b) => b.maxY)) };
}
function rectHandleAt(b: Rect, p: Point, zoom: number): ResizeHandle | null {
  const nearL = Math.abs(p.x - b.minX) <= 8 / zoom, nearR = Math.abs(p.x - b.maxX) <= 8 / zoom;
  const nearT = Math.abs(p.y - b.minY) <= 8 / zoom, nearB = Math.abs(p.y - b.maxY) <= 8 / zoom;
  if (nearT && nearL) return "nw"; if (nearT && nearR) return "ne";
  if (nearB && nearL) return "sw"; if (nearB && nearR) return "se";
  if (nearT) return "n"; if (nearB) return "s"; if (nearL) return "w"; if (nearR) return "e";
  return null;
}
