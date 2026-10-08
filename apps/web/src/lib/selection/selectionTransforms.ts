import type { Element, Point } from "@repo/common";
import {
  getBoundsCenter,
  getElementLocalBounds,
  measureText,
} from "@repo/engine";
import { scene } from "@/lib/scene/scene";
import { getLinearPointLocalPosition, type ResizeHandle } from "./handles";
import { resizeElement } from "./resize";
import { syncBoundArrowsForShape } from "./arrowBinding";
import { syncBoundTextToContainer } from "./boundElements";
import type { Rect } from "./selectionBounds";

export function resizeSelectedElement(
  original: Element,
  handle: ResizeHandle,
  point: Point,
  shiftKey: boolean,
  altKey: boolean,
): void {
  let resized = resizeElement(original, handle, point, shiftKey, altKey);

  if (original.type === "text" && resized.type === "text") {
    const originalWidth = Math.max(1, original.width ?? 0);
    const originalHeight = Math.max(1, original.height ?? 0);
    const scaleX = Math.max(0.05, (resized.width ?? 0) / originalWidth);
    const scaleY = Math.max(0.05, (resized.height ?? 0) / originalHeight);
    const horizontal = handle.includes("w") || handle.includes("e");
    const vertical = handle.includes("n") || handle.includes("s");
    const rawFontScale =
      horizontal && vertical
        ? Math.sqrt(scaleX * scaleY)
        : horizontal
          ? scaleX
          : scaleY;
    const fontSize = Math.max(1, original.fontSize * rawFontScale);
    const width = Math.max(1, resized.width ?? 0);
    const textHeight = measureText(
      original.text,
      fontSize,
      original.fontFamily,
      width,
    ).height;
    const height = Math.max(resized.height ?? 0, textHeight);
    const resizedFromTop = handle.includes("n");
    resized = {
      ...resized,
      fontSize,
      width,
      height,
      y: resizedFromTop
        ? original.y + (original.height ?? 0) - height
        : resized.y,
      wrapText: true,
    };
  }

  scene.mutateElement(
    original.id,
    resized as Partial<Omit<Element, "id" | "type">>,
  );
  const resizedElement = scene.getElement(original.id);
  if (resizedElement) {
    syncBoundTextToContainer(resizedElement);
    syncBoundArrowsForShape(resizedElement);
  }
  return;
}

export function resizeSelectedGroup(
  originals: Element[],
  bounds: Rect,
  handle: ResizeHandle,
  point: Point,
): void {
  const b = bounds;
  const left = handle.includes("w"),
    top = handle.includes("n");
  const horizontal = handle.includes("w") || handle.includes("e");
  const vertical = handle.includes("n") || handle.includes("s");
  const anchorX = horizontal ? (left ? b.maxX : b.minX) : (b.minX + b.maxX) / 2;
  const anchorY = vertical ? (top ? b.maxY : b.minY) : (b.minY + b.maxY) / 2;
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
  for (const original of originals) {
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
  for (const original of originals) {
    const resizedElement = scene.getElement(original.id);
    if (resizedElement) syncBoundArrowsForShape(resizedElement);
  }
  return;
}

export function moveSelectedPoint(
  elementId: string,
  pointIndex: number,
  point: Point,
): void {
  const element = scene.getElement(elementId);
  if (element && "points" in element) {
    const points = element.points.map((p) => ({ ...p }));
    const p = points[pointIndex];
    if (p) {
      const isLinear = element.type === "line" || element.type === "arrow";
      const localPoint = isLinear
        ? getLinearPointLocalPosition(element, point)
        : { x: point.x - element.x, y: point.y - element.y };
      points[pointIndex] = {
        ...p,
        ...localPoint,
      };
      if (isLinear) {
        const oldCenter = getBoundsCenter(getElementLocalBounds(element));
        const updatedElement = { ...element, points };
        const newCenter = getBoundsCenter(
          getElementLocalBounds(updatedElement),
        );
        const dx = oldCenter.x - newCenter.x;
        const dy = oldCenter.y - newCenter.y;
        const angle = element.angle ?? 0;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const originOffsetX = dx - (dx * cos - dy * sin);
        const originOffsetY = dy - (dx * sin + dy * cos);
        scene.mutateElement(element.id, {
          points,
          x: element.x + originOffsetX,
          y: element.y + originOffsetY,
        } as Partial<Omit<Element, "id" | "type">>);
        return;
      }
    }
    scene.mutateElement(element.id, { points } as Partial<
      Omit<Element, "id" | "type">
    >);
  }
  return;
}
