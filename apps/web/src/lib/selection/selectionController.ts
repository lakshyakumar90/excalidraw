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
  getLinearPointHandleAtPosition,
  getLinearPointLocalPosition,
  getLinearPointWorldPosition,
  getLinearBendHandlePoint,
  isNearLinearBendHandle,
  type ResizeHandle,
} from "./handles";
import {
  resizeSelectedElement,
  resizeSelectedGroup,
  moveSelectedPoint,
} from "./selectionTransforms";
import { selectionStore } from "./selectionStore";
import { historyStore } from "@/lib/history/historyStore";
import { commitHistoryEntry } from "@/lib/sync/commits";

import {
  cloneElement,
  duplicateElements,
  parseCopiedElements,
  ELEMENTS_CLIPBOARD_MARKER,
  ELEMENTS_CLIPBOARD_VERSION,
} from "./elementClipboard";
import { getMovementSnapshots, translateSnapshots } from "./boundElements";
import { getSelectionBounds, rectHandleAt, type Rect } from "./selectionBounds";

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

    if (pointEditingElementId) {
      const editingElement = scene.getElement(pointEditingElementId);
      if (editingElement && "points" in editingElement) {
        const nearPoint = editingElement.points.some((item) => {
          const world =
            editingElement.type === "line" || editingElement.type === "arrow"
              ? getLinearPointWorldPosition(editingElement, item)
              : { x: editingElement.x + item.x, y: editingElement.y + item.y };
          return Math.hypot(point.x - world.x, point.y - world.y) <= 10 / zoom;
        });
        if (nearPoint) return "move";
      }
    }

    const selectedIds = [...selectionStore.getSnapshot()];
    if (selectedIds.length > 1) {
      const bounds = getSelectionBounds(selectedIds);
      const handle = bounds && rectHandleAt(bounds, point, zoom);
      if (handle) return getResizeCursor(handle, 0);
    }
    if (selectedIds.length !== 1) return "default";

    const selectedElement = scene.getElement(selectedIds[0]!);
    if (!selectedElement || selectedElement.isDeleted) return "default";

    if (selectedElement.type === "line" || selectedElement.type === "arrow") {
      if (
        getLinearPointHandleAtPosition(selectedElement, point, zoom) !== null ||
        isNearLinearBendHandle(selectedElement, point, zoom)
      ) {
        return "move";
      }
    }

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
        const nearest = element.points.findIndex((p) => {
          const world =
            element.type === "line" || element.type === "arrow"
              ? getLinearPointWorldPosition(element, p)
              : { x: element.x + p.x, y: element.y + p.y };
          return Math.hypot(point.x - world.x, point.y - world.y) <= 10 / zoom;
        });
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
        if (
          selectedElement.type === "line" ||
          selectedElement.type === "arrow"
        ) {
          if (isNearLinearBendHandle(selectedElement, point, zoom)) {
            if (selectedElement.points.length === 2) {
              const bendPoint = getLinearBendHandlePoint(selectedElement);
              const start = selectedElement.points[0];
              const end = selectedElement.points[1];
              if (!bendPoint || !start || !end) return;
              const middle = getLinearPointLocalPosition(
                selectedElement,
                bendPoint,
              );
              scene.mutateElement(selectedElement.id, {
                points: [{ ...start }, middle, { ...end }],
                lineType: "curved",
              });
              gesture = {
                kind: "point",
                elementId: selectedElement.id,
                pointIndex: 1,
              };
              return;
            }
            gesture = {
              kind: "point",
              elementId: selectedElement.id,
              pointIndex: Math.floor(selectedElement.points.length / 2),
            };
            return;
          }
          const pointIndex = getLinearPointHandleAtPosition(
            selectedElement,
            point,
            zoom,
          );
          if (pointIndex !== null) {
            gesture = {
              kind: "point",
              elementId: selectedElement.id,
              pointIndex,
            };
            return;
          }
        }
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
      resizeSelectedElement(
        gesture.original,
        gesture.handle,
        point,
        shiftKey,
        altKey,
      );
      return;
    }
    if (gesture.kind === "group-resize") {
      resizeSelectedGroup(
        gesture.originals,
        gesture.bounds,
        gesture.handle,
        point,
      );
      return;
    }
    if (gesture.kind === "point") {
      moveSelectedPoint(gesture.elementId, gesture.pointIndex, point);
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
    if (element.type === "line" || element.type === "arrow") {
      pointEditingElementId = element.id;
    }
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
    const { result, changes } = historyStore.commitUpdate(() =>
      this.groupSelectionWithoutCapture(),
    );
    commitHistoryEntry(changes, "local");
    return result;
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
    const { result, changes } = historyStore.commitUpdate(() =>
      this.ungroupSelectionWithoutCapture(),
    );
    commitHistoryEntry(changes, "local");
    return result;
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
    const { result, changes } = historyStore.commitUpdate(() =>
      this.duplicateSelectionWithoutCapture(offset),
    );
    commitHistoryEntry(changes, "local");
    return result;
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

    const { result, changes } = historyStore.commitUpdate(() => {
      const pastedElements = duplicateElements(elements!, offsetX, offsetY);
      for (const element of pastedElements) scene.addElement(element);
      selectionStore.set(pastedElements.map((element) => element.id));
      groupDrillPath = [];
      return true;
    });
    commitHistoryEntry(changes, "local");
    return result;
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
    const { changes } = historyStore.commitUpdate(() => {
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
        if (element.type === "arrow") {
          for (const binding of [element.startBinding, element.endBinding]) {
            const target = binding
              ? scene.getElement(binding.elementId)
              : undefined;
            if (
              target &&
              (target.type === "rectangle" ||
                target.type === "ellipse" ||
                target.type === "diamond")
            ) {
              scene.mutateElement(target.id, {
                boundElements: (target.boundElements ?? []).filter(
                  (boundId) => boundId !== element.id,
                ),
              });
            }
          }
        }
        if (
          element.type === "rectangle" ||
          element.type === "ellipse" ||
          element.type === "diamond"
        ) {
          for (const boundId of element.boundElements ?? []) {
            const arrow = scene.getElement(boundId);
            if (arrow?.type !== "arrow") continue;
            scene.mutateElement(arrow.id, {
              ...(arrow.startBinding?.elementId === element.id
                ? { startBinding: undefined }
                : {}),
              ...(arrow.endBinding?.elementId === element.id
                ? { endBinding: undefined }
                : {}),
            });
          }
        }
      }
      for (const id of elementsToDelete) {
        scene.mutateElement(id, { isDeleted: true });
      }
      selectionStore.clear();
    });
    commitHistoryEntry(changes, "local");
  },

  nudgeSelection(dx: number, dy: number): void {
    const { changes: nudgeChanges } = historyStore.commitUpdate(() => {
      const selectedElements = [...selectionStore.getSnapshot()]
        .map((id) => scene.getElement(id))
        .filter(
          (element): element is Element => !!element && !element.isDeleted,
        );
      translateSnapshots(getMovementSnapshots(selectedElements), dx, dy);
    });
    commitHistoryEntry(nudgeChanges, "local");
  },
};

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
