import type { Element, PreviewWireElement } from "@repo/common";

/**
 * Project a committed scene element to its bounded wire preview shape:
 * geometry only, no versions, no styles, no file bytes. Deleted elements
 * never preview. Pure and unit-tested.
 */
export function toPreviewElement(element: Element): PreviewWireElement | null {
  if (element.isDeleted === true) return null;
  const preview: PreviewWireElement = {
    id: element.id,
    type: element.type,
    x: element.x,
    y: element.y,
  };
  if (typeof element.width === "number" && Number.isFinite(element.width)) {
    preview.width = element.width;
  }
  if (typeof element.height === "number" && Number.isFinite(element.height)) {
    preview.height = element.height;
  }
  if (typeof element.angle === "number" && Number.isFinite(element.angle)) {
    preview.angle = element.angle;
  }
  if (
    (element.type === "line" ||
      element.type === "arrow" ||
      element.type === "freedraw") &&
    Array.isArray(element.points)
  ) {
    preview.points = element.points
      .filter(
        (point): point is { x: number; y: number } =>
          !!point &&
          typeof point.x === "number" &&
          Number.isFinite(point.x) &&
          typeof point.y === "number" &&
          Number.isFinite(point.y),
      )
      .map((point) => ({ x: point.x, y: point.y }));
  }
  if (element.type === "text" && typeof element.text === "string") {
    preview.text = element.text;
  }
  return preview;
}
