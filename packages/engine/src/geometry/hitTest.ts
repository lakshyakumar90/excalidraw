/*
- getElementAtPosition(...) finds the topmost element under a scene-coordinate pointer.
- isPointOnElement(...) handles the current element types, applies zoom-aware pointer tolerance, and accounts for rotation.
- elementIntersectsRect(...) implements the plan’s marquee rule: an element is selected when its full bounding box is inside the dragged rectangle.
*/

import type { Element, Point } from "@repo/common";
import { getElementBounds } from "./element";
import { getBoundsCenter, isPointInsideBounds } from "./bounds";
import { getElementLocalBounds } from "./elementLocalBounds";
import { rotatePoint } from "./rotation";
import { getArrowHeadPoints } from "./arrow";
import { sampleCatmullRom } from "./curve";
import { buildClosedStrokePath } from "./strokeOutline";

const MIN_ZOOM = 0.1;
const POINTER_TOLERANCE_PIXELS = 10;

function getLocalPoint(element: Element, point: Point): Point {
  // Renderers rotate each element around the center used by its local bounds.
  const localCenter = getBoundsCenter(getElementLocalBounds(element));
  const worldCenter = {
    x: element.x + localCenter.x,
    y: element.y + localCenter.y,
  };

  const unrotated = rotatePoint(point, -(element.angle ?? 0), worldCenter);

  return {
    x: unrotated.x - element.x,
    y: unrotated.y - element.y,
  };
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const projection = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    ),
  );

  const closest = {
    x: start.x + projection * dx,
    y: start.y + projection * dy,
  };

  return Math.hypot(point.x - closest.x, point.y - closest.y);
}

function distanceToPolyline(
  point: Point,
  points: readonly Point[],
  tolerance: number,
  closed = false,
): boolean {
  if (points.length < 2) return false;

  for (let i = 1; i < points.length; i += 1) {
    const start = points[i - 1];
    const end = points[i];

    if (start && end && distanceToSegment(point, start, end) <= tolerance) {
      return true;
    }
  }

  if (closed) {
    const first = points[0];
    const last = points[points.length - 1];

    if (first && last && distanceToSegment(point, last, first) <= tolerance) {
      return true;
    }
  }

  return false;
}

function isPointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  if (polygon.length < 3) return false;

  let inside = false;

  for (
    let currentIndex = 0, previousIndex = polygon.length - 1;
    currentIndex < polygon.length;
    previousIndex = currentIndex, currentIndex += 1
  ) {
    const current = polygon[currentIndex];
    const previous = polygon[previousIndex];

    if (!current || !previous) continue;

    const crossesRay =
      current.y > point.y !== previous.y > point.y &&
      point.x <
        ((previous.x - current.x) * (point.y - current.y)) /
          (previous.y - current.y) +
          current.x;

    if (crossesRay) inside = !inside;
  }

  return inside;
}

function isFilled(element: Element): boolean {
  return (
    element.backgroundColor !== undefined &&
    element.backgroundColor !== "transparent"
  );
}

function hitRectangle(
  element: Extract<Element, { type: "rectangle" | "text" }>,
  point: Point,
  tolerance: number,
): boolean {
  const width = element.width ?? 0;
  const height = element.height ?? 0;

  const corners: Point[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];

  const inside =
    point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height;

  if (isFilled(element) && inside) return true;
  return distanceToPolyline(point, corners, tolerance, true);
}

function hitEllipse(
  element: Extract<Element, { type: "ellipse" }>,
  point: Point,
  tolerance: number,
): boolean {
  const width = Math.abs(element.width ?? 0);
  const height = Math.abs(element.height ?? 0);

  if (width === 0 || height === 0) return false;

  const center = { x: width / 2, y: height / 2 };
  const rx = width / 2;
  const ry = height / 2;
  const normalizedDistance =
    ((point.x - center.x) / rx) ** 2 + ((point.y - center.y) / ry) ** 2;

  if (isFilled(element) && normalizedDistance <= 1) return true;

  // Approximate the ellipse outline with short segments for pointer hit testing.
  const outline: Point[] = [];
  const segmentCount = 64;

  for (let i = 0; i < segmentCount; i += 1) {
    const angle = (i / segmentCount) * Math.PI * 2;
    outline.push({
      x: center.x + Math.cos(angle) * rx,
      y: center.y + Math.sin(angle) * ry,
    });
  }

  return distanceToPolyline(point, outline, tolerance, true);
}

function hitDiamond(
  element: Extract<Element, { type: "diamond" }>,
  point: Point,
  tolerance: number,
): boolean {
  const width = Math.abs(element.width ?? 0);
  const height = Math.abs(element.height ?? 0);

  const polygon: Point[] = [
    { x: width / 2, y: 0 },
    { x: width, y: height / 2 },
    { x: width / 2, y: height },
    { x: 0, y: height / 2 },
  ];

  if (isFilled(element) && isPointInPolygon(point, polygon)) return true;
  return distanceToPolyline(point, polygon, tolerance, true);
}

function hitLine(
  element: Extract<Element, { type: "line" }>,
  point: Point,
  tolerance: number,
): boolean {
  const points =
    element.lineType === "curved"
      ? sampleCatmullRom(element.points, 12)
      : element.points;

  return distanceToPolyline(point, points, tolerance);
}

function hitArrow(
  element: Extract<Element, { type: "arrow" }>,
  point: Point,
  tolerance: number,
): boolean {
  const points = element.points;

  if (distanceToPolyline(point, points, tolerance)) return true;

  const end = points[points.length - 1];
  const previous = points[points.length - 2];

  if (!end || !previous) return false;

  const strokeWidth = element.strokeWidth ?? 1;
  const arrowHead = getArrowHeadPoints(
    previous,
    end,
    Math.max(10, strokeWidth * 4),
  );

  if (!arrowHead) return false;

  return (
    distanceToSegment(point, end, arrowHead.left) <= tolerance ||
    distanceToSegment(point, end, arrowHead.right) <= tolerance
  );
}

function hitFreedraw(
  element: Extract<Element, { type: "freedraw" }>,
  point: Point,
  tolerance: number,
): boolean {
  const outline = buildClosedStrokePath(
    element.points,
    element.strokeWidth ?? 1,
  );

  return (
    isPointInPolygon(point, outline) ||
    distanceToPolyline(point, outline, tolerance, true)
  );
}

export function isPointOnElement(
  element: Element,
  worldPoint: Point,
  zoom: number,
): boolean {
  if (element.isDeleted) return false;

  const safeZoom = Math.max(zoom, MIN_ZOOM);
  const tolerance =
    POINTER_TOLERANCE_PIXELS / safeZoom + (element.strokeWidth ?? 1) / 2;

  const bounds = getElementBounds(element);

  // Avoid detailed shape checks when the pointer is clearly outside its bounds.
  // Curved lines can extend slightly beyond their control-point bounds, so skip
  // this early rejection for them.
  const isCurvedLine = element.type === "line" && element.lineType === "curved";

  if (!isCurvedLine && !isPointInsideBounds(worldPoint, bounds, tolerance)) {
    return false;
  }

  const point = getLocalPoint(element, worldPoint);

  switch (element.type) {
    case "rectangle":
    case "text":
      return hitRectangle(element, point, tolerance);

    case "ellipse":
      return hitEllipse(element, point, tolerance);

    case "diamond":
      return hitDiamond(element, point, tolerance);

    case "line":
      return hitLine(element, point, tolerance);

    case "arrow":
      return hitArrow(element, point, tolerance);

    case "freedraw":
      return hitFreedraw(element, point, tolerance);

    default: {
      const exhaustiveCheck: never = element;
      return exhaustiveCheck;
    }
  }
}

export function getElementAtPosition(
  elements: readonly Element[],
  point: Point,
  zoom: number,
): Element | undefined {
  // Elements later in the array are drawn on top, so check them first.
  for (let i = elements.length - 1; i >= 0; i -= 1) {
    const element = elements[i];

    if (element && isPointOnElement(element, point, zoom)) {
      return element;
    }
  }

  return undefined;
}

export interface SelectionRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function elementIntersectsRect(
  element: Element,
  rect: SelectionRect,
): boolean {
  if (element.isDeleted) return false;

  const bounds = getElementBounds(element);

  // Match the plan's marquee rule: select an element when its full bounding
  // box is inside the dragged rectangle.
  return (
    bounds.minX >= rect.minX &&
    bounds.minY >= rect.minY &&
    bounds.maxX <= rect.maxX &&
    bounds.maxY <= rect.maxY
  );
}
