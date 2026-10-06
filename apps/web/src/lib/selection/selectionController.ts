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
  getArrowMidpoint,
  getElementAtPosition,
  getElementsAtPosition,
  getElementBounds,
  measureText,
} from "@repo/engine";
import { scene } from "@/lib/scene/scene";
import {
  getResizeCursor,
  getResizeHandleAtPosition,
  type ResizeHandle,
} from "./handles";
import { resizeElement } from "./resize";
import { selectionStore } from "./selectionStore";
import { historyStore } from "@/lib/history/historyStore";

export interface MarqueePreview {
  start: Point;
  current: Point;
}

const ELEMENTS_CLIPBOARD_MARKER = "excalidraw-elements";
const ELEMENTS_CLIPBOARD_VERSION = 1;

function getBoundMovementElements(element: Element): Element[] {
  const related = new Map<string, Element>();

  if (element.type === "text" && element.containerId) {
    const container = scene.getElement(element.containerId);
    if (container && !container.isDeleted) related.set(container.id, container);
  }

  for (const id of element.boundElements ?? []) {
    const bound = scene.getElement(id);
    if (
      bound?.type === "text" &&
      bound.containerId === element.id &&
      !bound.isDeleted
    ) {
      related.set(bound.id, bound);
    }
  }

  return [...related.values()];
}

function getMovementSnapshots(
  elements: readonly Element[],
): Array<{ id: string; x: number; y: number }> {
  const snapshots = new Map<string, { id: string; x: number; y: number }>();
  const pending = [...elements];

  while (pending.length > 0) {
    const element = pending.pop();
    if (!element || snapshots.has(element.id)) continue;
    snapshots.set(element.id, {
      id: element.id,
      x: element.x,
      y: element.y,
    });
    pending.push(...getBoundMovementElements(element));
  }

  return [...snapshots.values()];
}

function translateSnapshots(
  elements: readonly { id: string; x: number; y: number }[],
  dx: number,
  dy: number,
): void {
  for (const element of elements) {
    scene.mutateElement(element.id, {
      x: element.x + dx,
      y: element.y + dy,
    });
  }
}

function syncBoundTextToContainer(container: Element): void {
  if (container.type !== "rectangle" && container.type !== "arrow") return;

  const boundTexts = (container.boundElements ?? [])
    .map((id) => scene.getElement(id))
    .filter(
      (element): element is Extract<Element, { type: "text" }> =>
        element?.type === "text" &&
        element.containerId === container.id &&
        !element.isDeleted,
    );
  let height = container.height ?? 0;
  if (container.type === "rectangle") {
    const wrappedHeight = Math.max(
      0,
      ...boundTexts.map(
        (text) =>
          measureText(
            text.text,
            text.fontSize,
            text.fontFamily,
            container.width ?? 0,
          ).height,
      ),
    );
    height = Math.max(height, wrappedHeight);

    if (height > (container.height ?? 0)) {
      scene.mutateElement(container.id, { height });
    }
  }

  for (const text of boundTexts) {
    if (container.type === "rectangle") {
      scene.mutateElement(text.id, {
        x: container.x,
        y: container.y,
        width: container.width,
        height,
        angle: container.angle,
      });
    } else {
      const midpoint = getArrowMidpoint(container);
      const metrics = measureText(text.text, text.fontSize, text.fontFamily);
      const width = Math.max(20, metrics.width);
      scene.mutateElement(text.id, {
        x: midpoint.x - width / 2,
        y: midpoint.y - metrics.height / 2,
        width,
        height: metrics.height,
        angle: 0,
      });
    }
  }
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
      kind: "duplicate-press";
      start: Point;
      zoom: number;
      sourceElements: Element[];
      clickSelection: string[];
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

    if (altKey) {
      const sourceIds = selectedAtStart.has(hit.id)
        ? selectedIds
        : clickSelection;
      const sourceElements = sourceIds
        .map((id) => scene.getElement(id))
        .filter(
          (element): element is Element => !!element && !element.isDeleted,
        )
        .map(cloneElement);
      selectionStore.set(clickSelection);
      gesture = {
        kind: "duplicate-press",
        start: point,
        zoom,
        sourceElements,
        clickSelection,
      };
      return;
    }

    if (!shiftKey && wasSelected && selectedIds.length > 1) {
      const elements = selectedIds
        .map((id) => scene.getElement(id))
        .filter(
          (element): element is Element => !!element && !element.isDeleted,
        );
      gesture = {
        kind: "group-press",
        start: point,
        zoom,
        selectedId: hit.id,
        clickSelection,
        elements: getMovementSnapshots(elements),
      };
      return;
    }

    if (shiftKey) {
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
      );

    gesture = {
      kind: "move",
      start: point,
      elements: getMovementSnapshots(elements),
    };
  },

  pointerMove(point: Point, shiftKey: boolean, altKey: boolean): void {
    if (gesture.kind === "duplicate-press") {
      if (
        Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) <
        CLICK_DRAG_THRESHOLD_PIXELS / gesture.zoom
      ) {
        return;
      }

      const duplicates = duplicateElements(gesture.sourceElements, 0, 0);
      for (const duplicate of duplicates) scene.addElement(duplicate);
      selectionStore.set(duplicates.map((element) => element.id));
      gesture = {
        kind: "move",
        start: gesture.start,
        elements: getMovementSnapshots(duplicates),
      };
    }

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
      let resized = resizeElement(
        gesture.original,
        gesture.handle,
        point,
        shiftKey,
        altKey,
      );

      if (gesture.original.type === "text" && resized.type === "text") {
        const originalWidth = Math.max(1, gesture.original.width ?? 0);
        const originalHeight = Math.max(1, gesture.original.height ?? 0);
        const scaleX = Math.max(0.05, (resized.width ?? 0) / originalWidth);
        const scaleY = Math.max(0.05, (resized.height ?? 0) / originalHeight);
        const horizontal =
          gesture.handle.includes("w") || gesture.handle.includes("e");
        const vertical =
          gesture.handle.includes("n") || gesture.handle.includes("s");
        const rawFontScale =
          horizontal && vertical
            ? Math.sqrt(scaleX * scaleY)
            : horizontal
              ? scaleX
              : scaleY;
        const fontSize = Math.max(1, gesture.original.fontSize * rawFontScale);
        const width = Math.max(1, resized.width ?? 0);
        const textHeight = measureText(
          gesture.original.text,
          fontSize,
          gesture.original.fontFamily,
          width,
        ).height;
        const height = Math.max(resized.height ?? 0, textHeight);
        const resizedFromTop = gesture.handle.includes("n");
        resized = {
          ...resized,
          fontSize,
          width,
          height,
          y: resizedFromTop
            ? gesture.original.y + (gesture.original.height ?? 0) - height
            : resized.y,
          wrapText: true,
        };
      }

      scene.mutateElement(
        gesture.original.id,
        resized as Partial<Omit<Element, "id" | "type">>,
      );
      const resizedElement = scene.getElement(gesture.original.id);
      if (resizedElement) syncBoundTextToContainer(resizedElement);
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

    translateSnapshots(gesture.elements, dx, dy);
  },

  pointerUp(point: Point, shiftKey: boolean, altKey: boolean): void {
    if (gesture.kind === "duplicate-press") {
      const movedFarEnough =
        Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) >=
        CLICK_DRAG_THRESHOLD_PIXELS / gesture.zoom;
      if (movedFarEnough) this.pointerMove(point, shiftKey, altKey);
      if (gesture.kind === "duplicate-press") {
        selectionStore.set(gesture.clickSelection);
        gesture = { kind: "idle" };
        return;
      }
    }

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

  selectAtContextMenu(point: Point, zoom: number): boolean {
    const element = getElementAtPosition(scene.getElements(), point, zoom);
    if (!element) return false;

    const clickSelection = getClickSelectionIds(element);
    const selectedIds = selectionStore.getSnapshot();
    const unitIsSelected = clickSelection.every((id) => selectedIds.has(id));
    if (
      !selectedIds.has(element.id) ||
      (clickSelection.length > 1 && selectedIds.size === 1 && !unitIsSelected)
    ) {
      selectionStore.set(clickSelection);
    }
    return true;
  },

  canUngroupSelection(): boolean {
    return [...selectionStore.getSnapshot()].some((id) => {
      const element = scene.getElement(id);
      return (
        !!element && !element.isDeleted && (element.groupIds?.length ?? 0) > 0
      );
    });
  },

  groupSelection(): boolean {
    return historyStore.captureUpdate(() => this.groupSelectionWithoutCapture());
  },

  groupSelectionWithoutCapture(): boolean {
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
    return historyStore.captureUpdate(() => this.ungroupSelectionWithoutCapture());
  },

  ungroupSelectionWithoutCapture(): boolean {
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

  duplicateSelection(offset = 10): boolean {
    return historyStore.captureUpdate(() => this.duplicateSelectionWithoutCapture(offset));
  },

  duplicateSelectionWithoutCapture(offset = 10): boolean {
    const elements = [...selectionStore.getSnapshot()]
      .map((id) => scene.getElement(id))
      .filter((element): element is Element => !!element && !element.isDeleted)
      .map(cloneElement);
    if (elements.length === 0) return false;

    const duplicates = duplicateElements(elements, offset, offset);
    for (const duplicate of duplicates) scene.addElement(duplicate);
    selectionStore.set(duplicates.map((element) => element.id));
    groupDrillPath = [];
    return true;
  },

  async copySelectionToClipboard(): Promise<boolean> {
    const selectedIds = new Set(selectionStore.getSnapshot());
    const elements = scene
      .getElements()
      .filter((element) => selectedIds.has(element.id) && !element.isDeleted)
      .map(cloneElement);
    if (elements.length === 0 || !navigator.clipboard?.writeText) return false;

    const clipboardData = {
      type: ELEMENTS_CLIPBOARD_MARKER,
      version: ELEMENTS_CLIPBOARD_VERSION,
      elements,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(clipboardData));
      return true;
    } catch {
      return false;
    }
  },

  async pasteFromClipboard(cursor: Point): Promise<boolean> {
    if (!navigator.clipboard?.readText) return false;

    let elements: Element[] | null = null;
    try {
      const text = await navigator.clipboard.readText();
      elements = parseCopiedElements(text);
    } catch {
      return false;
    }
    if (!elements?.length) return false;

    const bounds = elements.map(getElementBounds);
    const minX = Math.min(...bounds.map((bound) => bound.minX));
    const minY = Math.min(...bounds.map((bound) => bound.minY));
    const maxX = Math.max(...bounds.map((bound) => bound.maxX));
    const maxY = Math.max(...bounds.map((bound) => bound.maxY));
    const offsetX = cursor.x - (minX + maxX) / 2;
    const offsetY = cursor.y - (minY + maxY) / 2;

    return historyStore.captureUpdate(() => {
      const pastedElements = duplicateElements(elements!, offsetX, offsetY);
      for (const element of pastedElements) scene.addElement(element);
      selectionStore.set(pastedElements.map((element) => element.id));
      groupDrillPath = [];
      return true;
    });
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
    historyStore.captureUpdate(() => {
      const selectedIds = new Set(selectionStore.getSnapshot());
      const elementsToDelete = new Set(selectedIds);
      for (const id of selectedIds) {
        const element = scene.getElement(id);
        if (!element || element.isDeleted) continue;
        for (const boundId of element.boundElements ?? []) {
          const boundElement = scene.getElement(boundId);
          if (boundElement?.type === "text") elementsToDelete.add(boundId);
        }
        if (element.type === "text" && element.containerId) {
          const container = scene.getElement(element.containerId);
          if (container) {
            scene.mutateElement(container.id, {
              boundElements: (container.boundElements ?? []).filter(
                (boundId) => boundId !== element.id,
              ),
            });
          }
        }
      }
      for (const id of elementsToDelete) {
        scene.mutateElement(id, { isDeleted: true });
      }
      selectionStore.clear();
    });
  },

  nudgeSelection(dx: number, dy: number): void {
    historyStore.captureUpdate(() => {
      const selectedElements = [...selectionStore.getSnapshot()]
        .map((id) => scene.getElement(id))
        .filter((element): element is Element => !!element && !element.isDeleted);
      translateSnapshots(getMovementSnapshots(selectedElements), dx, dy);
    });
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

function duplicateElements(
  elements: readonly Element[],
  offsetX: number,
  offsetY: number,
): Element[] {
  const elementIdMap = new Map(
    elements.map((element) => [element.id, crypto.randomUUID()]),
  );
  const groupIdMap = new Map<string, string>();
  for (const element of elements) {
    for (const groupId of element.groupIds ?? []) {
      if (!groupIdMap.has(groupId)) {
        groupIdMap.set(groupId, crypto.randomUUID());
      }
    }
  }

  const now = Date.now();
  return elements.map((element) => {
    const duplicate = {
      ...cloneElement(element),
      id: elementIdMap.get(element.id)!,
      x: element.x + offsetX,
      y: element.y + offsetY,
      version: 1,
      versionNonce: Math.floor(Math.random() * 2_147_483_647),
      updated: now,
    } as Element;

    if (element.groupIds) {
      duplicate.groupIds = element.groupIds.map((groupId) =>
        groupIdMap.get(groupId)!,
      );
    }
    if (element.boundElements) {
      duplicate.boundElements = element.boundElements.flatMap((id) => {
        const mappedId = elementIdMap.get(id);
        return mappedId ? [mappedId] : [];
      });
    }
    if (element.frameId) {
      duplicate.frameId = elementIdMap.get(element.frameId) ?? null;
    }
    if (
      element.type === "text" &&
      duplicate.type === "text" &&
      element.containerId
    ) {
      duplicate.containerId = elementIdMap.get(element.containerId);
    }

    return duplicate;
  });
}

function parseCopiedElements(text: string): Element[] | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;
  if (
    data.type !== ELEMENTS_CLIPBOARD_MARKER ||
    data.version !== ELEMENTS_CLIPBOARD_VERSION ||
    !Array.isArray(data.elements)
  ) {
    return null;
  }

  const elements = data.elements;
  if (!elements.every(isClipboardElement)) return null;
  const ids = elements.map((element) => element.id);
  if (new Set(ids).size !== ids.length) return null;
  return elements;
}

function isClipboardElement(value: unknown): value is Element {
  if (!isRecord(value)) return false;
  if (
    typeof value.id !== "string" ||
    typeof value.type !== "string" ||
    ![
      "rectangle",
      "ellipse",
      "diamond",
      "line",
      "arrow",
      "freedraw",
      "text",
    ].includes(value.type) ||
    !isFiniteNumber(value.x) ||
    !isFiniteNumber(value.y)
  ) {
    return false;
  }

  for (const key of [
    "width",
    "height",
    "angle",
    "strokeWidth",
    "roughness",
    "opacity",
    "seed",
    "version",
    "versionNonce",
    "updated",
  ]) {
    if (value[key] !== undefined && !isFiniteNumber(value[key])) return false;
  }
  if (
    value.groupIds !== undefined &&
    (!Array.isArray(value.groupIds) || !value.groupIds.every(isString))
  ) {
    return false;
  }
  if (
    value.boundElements !== undefined &&
    (!Array.isArray(value.boundElements) ||
      !value.boundElements.every(isString))
  ) {
    return false;
  }
  if (value.containerId !== undefined && !isString(value.containerId)) {
    return false;
  }
  if (
    value.frameId !== undefined &&
    value.frameId !== null &&
    typeof value.frameId !== "string"
  ) {
    return false;
  }

  if (
    value.type === "line" ||
    value.type === "arrow" ||
    value.type === "freedraw"
  ) {
    if (
      !Array.isArray(value.points) ||
      !value.points.every((point: unknown) => {
        if (
          !isRecord(point) ||
          !isFiniteNumber(point.x) ||
          !isFiniteNumber(point.y)
        ) {
          return false;
        }
        return value.type !== "freedraw" || isFiniteNumber(point.pressure);
      })
    ) {
      return false;
    }
    if (
      value.type === "line" &&
      value.lineType !== "straight" &&
      value.lineType !== "curved"
    ) {
      return false;
    }
  }

  if (
    value.type === "text" &&
    (typeof value.text !== "string" ||
      !isFiniteNumber(value.fontSize) ||
      typeof value.fontFamily !== "string" ||
      !["left", "center", "right"].includes(String(value.textAlign)) ||
      !["top", "middle", "bottom"].includes(String(value.verticalAlign)))
  ) {
    return false;
  }

  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
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
