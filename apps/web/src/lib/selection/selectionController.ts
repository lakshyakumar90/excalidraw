/*
This controller owns canvas selection, transforms, and point editing:
- Click an element to select it.
- Drag a selected element to move it. If several elements are selected, they move together.
- Drag on empty canvas to select elements whose bounds overlap the marquee. Shift-drag adds those elements to the current selection.
- Dragging a resize handle resizes one element, with rotation, Shift, and Alt support.
*/

import type { Element, Point } from "@repo/common";
import {
  elementIntersectsRect,
  getElementAtPosition,
  getElementsAtPosition,
  getElementBounds,
} from "@repo/engine";
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
      kind: "group-press";
      start: Point;
      zoom: number;
      selectedId: string;
      clickSelection: string[];
      elements: Array<{ id: string; x: number; y: number }>;
    }
  | {
      kind: "resize";
      original: Element;
      handle: ResizeHandle;
    }
  | { kind: "point"; elementId: string; pointIndex: number }
  | {
      kind: "group-resize";
      originals: Element[];
      bounds: Rect;
      handle: ResizeHandle;
    };

let gesture: Gesture = { kind: "idle" };
let pointEditingElementId: string | null = null;
// groupIds are stored inner-to-outer. This path tracks the outer-to-inner
// groups entered by double-click.
let groupDrillPath: string[] = [];

const MIN_MARQUEE_PIXELS = 3;
const CLICK_DRAG_THRESHOLD_PIXELS = 10;
let previousOverlapClick: {
  x: number;
  y: number;
  ids: string[];
  index: number;
} | null = null;

export const selectionController = {
  getCursor(point: Point, zoom: number): string {
    if (gesture.kind === "resize") {
      return getResizeCursor(gesture.handle, gesture.original.angle ?? 0);
    }

    if (gesture.kind === "group-resize")
      return getResizeCursor(gesture.handle, 0);

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

  pointerDown(
    point: Point,
    shiftKey: boolean,
    zoom: number,
    altKey = false,
  ): void {
    if (pointEditingElementId) {
      const element = scene.getElement(pointEditingElementId);
      if (element && "points" in element) {
        const nearest = element.points.findIndex(
          (p) =>
            Math.hypot(point.x - element.x - p.x, point.y - element.y - p.y) <=
            10 / zoom,
        );
        if (nearest >= 0) {
          gesture = {
            kind: "point",
            elementId: element.id,
            pointIndex: nearest,
          };
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
          originals: selectedIds
            .map((id) => scene.getElement(id))
            .filter((e): e is Element => !!e && !e.isDeleted)
            .map(cloneElement),
          bounds,
          handle,
        };
        return;
      }
    }

    if (selectedIds.length === 1) {
      const selectedElement = scene.getElement(selectedIds[0]!);

      if (selectedElement && !selectedElement.isDeleted) {
        const handle = getResizeHandleAtPosition(selectedElement, point, zoom);

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

    const hits = getElementsAtPosition(scene.getElements(), point, zoom);
    let hit = hits[0];

    if (altKey && hits.length > 1) {
      const hitIds = hits.map((element) => element.id);
      const previous = previousOverlapClick;
      const sameStack =
        previous !== null &&
        previous.ids.length === hitIds.length &&
        previous.ids.every((id, index) => id === hitIds[index]) &&
        Math.hypot(point.x - previous.x, point.y - previous.y) <= 6 / zoom;
      const index = sameStack
        ? ((previous?.index ?? 0) + 1) % hits.length
        : 1 % hits.length;
      previousOverlapClick = { x: point.x, y: point.y, ids: hitIds, index };
      hit = hits[index];
    } else if (!altKey) {
      previousOverlapClick = null;
    }

    if (!hit) {
      groupDrillPath = [];
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

    const clickSelection = getClickSelectionIds(hit);
    const selectedAtStart = selectionStore.getSnapshot();
    const wasSelected = selectedAtStart.has(hit.id);
    const unitIsSelected = clickSelection.every((id) =>
      selectedAtStart.has(id),
    );

    if (!shiftKey && !altKey && wasSelected && selectedIds.length > 1) {
      const elements = selectedIds
        .map((id) => scene.getElement(id))
        .filter(
          (element): element is Element => !!element && !element.isDeleted,
        )
        .map((element) => ({ id: element.id, x: element.x, y: element.y }));
      gesture = {
        kind: "group-press",
        start: point,
        zoom,
        selectedId: hit.id,
        clickSelection,
        elements,
      };
      return;
    }

    if (altKey) {
      selectionStore.set(clickSelection);
    } else if (shiftKey) {
      const next = new Set(selectionStore.getSnapshot());
      for (const id of clickSelection) {
        if (unitIsSelected) next.delete(id);
        else next.add(id);
      }
      selectionStore.set(next);
      if (unitIsSelected) {
        gesture = { kind: "idle" };
        return;
      }
    } else if (!unitIsSelected) {
      // Clicking any member selects its current group unit.
      selectionStore.set(clickSelection);
    }

    const elements = [...selectionStore.getSnapshot()]
      .map((id) => scene.getElement(id))
      .filter(
        (element): element is Element =>
          element !== undefined && !element.isDeleted,
      )
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
    if (gesture.kind === "group-press") {
      if (
        Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) <
        CLICK_DRAG_THRESHOLD_PIXELS / gesture.zoom
      )
        return;
      gesture = {
        kind: "move",
        start: gesture.start,
        elements: gesture.elements,
      };
    }

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
      const left = gesture.handle.includes("w"),
        top = gesture.handle.includes("n");
      const horizontal =
        gesture.handle.includes("w") || gesture.handle.includes("e");
      const vertical =
        gesture.handle.includes("n") || gesture.handle.includes("s");
      const anchorX = horizontal
        ? left
          ? b.maxX
          : b.minX
        : (b.minX + b.maxX) / 2;
      const anchorY = vertical
        ? top
          ? b.maxY
          : b.minY
        : (b.minY + b.maxY) / 2;
      const scaleX = horizontal
        ? (point.x - anchorX) / ((left ? b.minX : b.maxX) - anchorX || 1)
        : null;
      const scaleY = vertical
        ? (point.y - anchorY) / ((top ? b.minY : b.maxY) - anchorY || 1)
        : null;
      const scale =
        scaleX !== null && scaleY !== null
          ? Math.abs(scaleX) >= Math.abs(scaleY)
            ? scaleX
            : scaleY
          : (scaleX ?? scaleY ?? 1);
      for (const original of gesture.originals) {
        const nextX = anchorX + (original.x - anchorX) * scale;
        const nextY = anchorY + (original.y - anchorY) * scale;
        const changes: Record<string, unknown> = {
          x: nextX,
          y: nextY,
          width: (original.width ?? 0) * Math.abs(scale),
          height: (original.height ?? 0) * Math.abs(scale),
          strokeWidth: (original.strokeWidth ?? 1) * Math.abs(scale),
        };
        if (original.type === "text")
          changes.fontSize = original.fontSize * Math.abs(scale);
        if ("points" in original)
          changes.points = original.points.map((p) => ({
            ...p,
            x: p.x * scale,
            y: p.y * scale,
          }));
        scene.mutateElement(
          original.id,
          changes as Partial<Omit<Element, "id" | "type">>,
        );
      }
      return;
    }

    if (gesture.kind === "point") {
      const element = scene.getElement(gesture.elementId);
      if (element && "points" in element) {
        const points = element.points.map((p) => ({ ...p }));
        const p = points[gesture.pointIndex];
        if (p)
          points[gesture.pointIndex] = {
            ...p,
            x: point.x - element.x,
            y: point.y - element.y,
          };
        scene.mutateElement(element.id, { points } as Partial<
          Omit<Element, "id" | "type">
        >);
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
    if (gesture.kind === "group-press") {
      if (
        Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) <
        CLICK_DRAG_THRESHOLD_PIXELS / gesture.zoom
      ) {
        selectionStore.set(gesture.clickSelection);
      } else {
        this.pointerMove(point, shiftKey, altKey);
      }
      gesture = { kind: "idle" };
      return;
    }

    if (
      gesture.kind === "move" ||
      gesture.kind === "resize" ||
      gesture.kind === "point" ||
      gesture.kind === "group-resize"
    ) {
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

        const intersectingElements = scene
          .getElements()
          .filter((element) => elementIntersectsRect(element, rect));
        const marqueeIds = new Set<string>();
        for (const element of intersectingElements) {
          for (const id of getClickSelectionIds(element)) marqueeIds.add(id);
        }

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
    const element = pointEditingElementId
      ? scene.getElement(pointEditingElementId)
      : undefined;
    return element && !element.isDeleted ? element : null;
  },

  handleDoubleClick(point: Point, zoom: number): void {
    const element = getElementAtPosition(scene.getElements(), point, zoom);
    if (!element) return;

    const stack = [...(element.groupIds ?? [])].reverse();
    const activeGroup = groupDrillPath.at(-1);
    if (activeGroup && !stack.includes(activeGroup)) groupDrillPath = [];

    if (stack.length > 0) {
      let drilled = false;
      if (groupDrillPath.length === 0) {
        groupDrillPath = [stack[0]!];
        drilled = true;
      } else {
        const nextGroup = stack[groupDrillPath.length];
        if (nextGroup) {
          groupDrillPath = [...groupDrillPath, nextGroup];
          drilled = true;
        }
      }

      if (drilled) {
        const enteredGroup = groupDrillPath.at(-1)!;
        const enteredIndex = stack.indexOf(enteredGroup);
        const childGroup = stack[enteredIndex + 1];
        selectionStore.set(
          childGroup ? getGroupMemberIds(childGroup) : [element.id],
        );
        pointEditingElementId = null;
        return;
      }
    }

    // Text editing is deferred until the canvas text tool is implemented.
    pointEditingElementId = null;
    selectionStore.set([element.id]);
    if (element.type === "line") pointEditingElementId = element.id;
  },

  exitPointEditing(): boolean {
    if (!pointEditingElementId) return false;
    pointEditingElementId = null;
    gesture = { kind: "idle" };
    return true;
  },

  exitGroupEditing(): boolean {
    if (groupDrillPath.length === 0) return false;
    const exitedGroup = groupDrillPath.pop();
    if (exitedGroup) selectionStore.set(getGroupMemberIds(exitedGroup));
    return true;
  },

  isCompleteGroupSelection(): boolean {
    const selectedIds = new Set(
      [...selectionStore.getSnapshot()].filter((id) => {
        const element = scene.getElement(id);
        return element !== undefined && !element.isDeleted;
      }),
    );
    if (selectedIds.size < 2) return false;

    for (const groupId of [...selectedIds].flatMap(
      (id) => scene.getElement(id)?.groupIds ?? [],
    )) {
      const members = getGroupMemberIds(groupId);
      if (
        members.length === selectedIds.size &&
        members.every((id) => selectedIds.has(id))
      ) {
        return true;
      }
    }
    return false;
  },

  groupSelection(): boolean {
    const elements = [...selectionStore.getSnapshot()]
      .map((id) => scene.getElement(id))
      .filter((element): element is Element => !!element && !element.isDeleted);
    if (elements.length < 2) return false;

    const groupId = crypto.randomUUID();
    for (const element of elements) {
      const groupIds = [...(element.groupIds ?? [])];
      const activeGroup = groupDrillPath.at(-1);
      const insertAt = activeGroup ? groupIds.lastIndexOf(activeGroup) : -1;
      if (insertAt >= 0) groupIds.splice(insertAt, 0, groupId);
      else groupIds.push(groupId);
      scene.mutateElement(element.id, {
        groupIds,
      });
    }
    selectionStore.set(elements.map((element) => element.id));
    return true;
  },

  ungroupSelection(): boolean {
    const selectedElements = [...selectionStore.getSnapshot()]
      .map((id) => scene.getElement(id))
      .filter((element): element is Element => !!element && !element.isDeleted);
    const groupIds = new Set<string>();
    for (const element of selectedElements) {
      const stack = [...(element.groupIds ?? [])].reverse();
      const groupId =
        stack[groupDrillPath.length] ?? groupDrillPath.at(-1) ?? stack[0];
      if (groupId) groupIds.add(groupId);
    }
    if (groupIds.size === 0) return false;

    groupDrillPath = [];
    const affectedElements = scene
      .getElements()
      .filter(
        (element) =>
          !element.isDeleted &&
          element.groupIds?.some((groupId) => groupIds.has(groupId)),
      );
    for (const element of affectedElements) {
      scene.mutateElement(element.id, {
        groupIds: (element.groupIds ?? []).filter(
          (groupId) => !groupIds.has(groupId),
        ),
      });
    }
    return true;
  },

  selectAll(): void {
    selectionStore.set(
      scene
        .getElements()
        .filter((element) => !element.isDeleted)
        .map((element) => element.id),
    );
  },

  deleteSelection(): void {
    for (const id of selectionStore.getSnapshot())
      scene.mutateElement(id, { isDeleted: true });
    selectionStore.clear();
  },

  nudgeSelection(dx: number, dy: number): void {
    for (const id of selectionStore.getSnapshot()) {
      const element = scene.getElement(id);
      if (element && !element.isDeleted)
        scene.mutateElement(id, { x: element.x + dx, y: element.y + dy });
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

function getGroupMemberIds(groupId: string): string[] {
  return scene
    .getElements()
    .filter(
      (element) => !element.isDeleted && element.groupIds?.includes(groupId),
    )
    .map((element) => element.id);
}

function getClickSelectionIds(element: Element): string[] {
  const stack = [...(element.groupIds ?? [])].reverse();
  const activeGroup = groupDrillPath.at(-1);
  if (activeGroup && !stack.includes(activeGroup)) groupDrillPath = [];
  const groupId = stack[groupDrillPath.length];
  return groupId ? getGroupMemberIds(groupId) : [element.id];
}

type Rect = { minX: number; minY: number; maxX: number; maxY: number };
function getSelectionBounds(ids: readonly string[]): Rect | null {
  const elements = ids
    .map((id) => scene.getElement(id))
    .filter((e): e is Element => !!e && !e.isDeleted);
  if (!elements.length) return null;
  const bounds = elements.map(getElementBounds);
  return {
    minX: Math.min(...bounds.map((b) => b.minX)),
    minY: Math.min(...bounds.map((b) => b.minY)),
    maxX: Math.max(...bounds.map((b) => b.maxX)),
    maxY: Math.max(...bounds.map((b) => b.maxY)),
  };
}
function rectHandleAt(b: Rect, p: Point, zoom: number): ResizeHandle | null {
  const nearL = Math.abs(p.x - b.minX) <= 8 / zoom,
    nearR = Math.abs(p.x - b.maxX) <= 8 / zoom;
  const nearT = Math.abs(p.y - b.minY) <= 8 / zoom,
    nearB = Math.abs(p.y - b.maxY) <= 8 / zoom;
  if (nearT && nearL) return "nw";
  if (nearT && nearR) return "ne";
  if (nearB && nearL) return "sw";
  if (nearB && nearR) return "se";
  if (nearT) return "n";
  if (nearB) return "s";
  if (nearL) return "w";
  if (nearR) return "e";
  return null;
}
