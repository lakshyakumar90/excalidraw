import type { Element, Point } from "@repo/common";
import {
  getBoundsCenter,
  getElementCorners,
  getElementLocalBounds,
  rotatePoint,
  sampleCatmullRom,
} from "@repo/engine";

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export type ResizeCursor =
  | "ew-resize"
  | "nwse-resize"
  | "ns-resize"
  | "nesw-resize";

export interface ResizeHandlePoint {
  handle: ResizeHandle;
  point: Point;
}

export interface LinearPointHandle {
  pointIndex: number;
  point: Point;
}

const HANDLE_HIT_RADIUS_PIXELS = 8;
const MIN_EDGE_HANDLE_SPACING_PIXELS = 20;

export function getResizeCursor(
  handle: ResizeHandle,
  elementAngle: number,
): ResizeCursor {
  let baseAngle: number;

  switch (handle) {
    case "e":
    case "w":
      baseAngle = 0;
      break;
    case "n":
    case "s":
      baseAngle = 90;
      break;
    case "nw":
    case "se":
      baseAngle = 45;
      break;
    case "ne":
    case "sw":
      baseAngle = 135;
      break;
    default:
      baseAngle = 0;
      break;
  }

  // CSS offers four resize cursor axes. Rotate the handle axis with its element,
  // then use the nearest supported cursor.
  const angle =
    (((baseAngle + (elementAngle * 180) / Math.PI) % 180) + 180) % 180;
  const nearestAxis = Math.round(angle / 45) % 4;

  switch (nearestAxis) {
    case 0:
      return "ew-resize";
    case 1:
      return "nwse-resize";
    case 2:
      return "ns-resize";
    default:
      return "nesw-resize";
  }
}

function midpoint(a: Point, b: Point): Point {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

export function getResizeHandles(
  element: Element,
  zoom: number,
): ResizeHandlePoint[] {
  if (element.type === "line" || element.type === "arrow") return [];

  const corners = getElementCorners(element);

  const topLeft = corners[0];
  const topRight = corners[1];
  const bottomRight = corners[2];
  const bottomLeft = corners[3];

  if (!topLeft || !topRight || !bottomRight || !bottomLeft) {
    return [];
  }

  const handles: ResizeHandlePoint[] = [
    { handle: "nw", point: topLeft },
    { handle: "ne", point: topRight },
    { handle: "se", point: bottomRight },
    { handle: "sw", point: bottomLeft },
  ];

  const widthPixels =
    Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y) * zoom;
  const heightPixels =
    Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y) * zoom;

  // Hide edge handles when they would sit too close to corner handles.
  if (widthPixels >= MIN_EDGE_HANDLE_SPACING_PIXELS) {
    handles.push(
      { handle: "n", point: midpoint(topLeft, topRight) },
      { handle: "s", point: midpoint(bottomLeft, bottomRight) },
    );
  }

  if (heightPixels >= MIN_EDGE_HANDLE_SPACING_PIXELS) {
    handles.push(
      { handle: "e", point: midpoint(topRight, bottomRight) },
      { handle: "w", point: midpoint(topLeft, bottomLeft) },
    );
  }

  return handles;
}

export function getLinearPointWorldPosition(
  element: Extract<Element, { type: "line" | "arrow" }>,
  point: Point,
): Point {
  const center = getBoundsCenter(getElementLocalBounds(element));
  const worldCenter = { x: element.x + center.x, y: element.y + center.y };
  return rotatePoint(
    { x: element.x + point.x, y: element.y + point.y },
    element.angle ?? 0,
    worldCenter,
  );
}

export function getLinearPointLocalPosition(
  element: Extract<Element, { type: "line" | "arrow" }>,
  point: Point,
): Point {
  const center = getBoundsCenter(getElementLocalBounds(element));
  const worldCenter = { x: element.x + center.x, y: element.y + center.y };
  const local = rotatePoint(point, -(element.angle ?? 0), worldCenter);
  return { x: local.x - element.x, y: local.y - element.y };
}

export function getLinearPathWorldPoints(
  element: Extract<Element, { type: "line" | "arrow" }>,
): Point[] {
  const points =
    element.type === "line" && element.lineType === "curved"
      ? sampleCatmullRom(element.points, 12)
      : element.points;
  return points.map((point) => getLinearPointWorldPosition(element, point));
}

export function getLinearEndpointHandles(
  element: Extract<Element, { type: "line" | "arrow" }>,
): LinearPointHandle[] {
  const points = element.points;
  if (points.length < 2) return [];
  const start = points[0];
  const end = points[points.length - 1];
  if (!start || !end) return [];

  const worldStart = getLinearPointWorldPosition(element, start);
  const worldEnd = getLinearPointWorldPosition(element, end);
  return [
    { pointIndex: 0, point: worldStart },
    { pointIndex: points.length - 1, point: worldEnd },
  ];
}

export function getLinearBendHandlePoint(
  element: Extract<Element, { type: "line" | "arrow" }>,
): Point | null {
  if (element.points.length !== 2) return null;
  const start = element.points[0];
  const end = element.points[1];
  if (!start || !end) return null;
  const worldStart = getLinearPointWorldPosition(element, start);
  const worldEnd = getLinearPointWorldPosition(element, end);
  return {
    x: (worldStart.x + worldEnd.x) / 2,
    y: (worldStart.y + worldEnd.y) / 2,
  };
}

export function isNearLinearBendHandle(
  element: Extract<Element, { type: "line" | "arrow" }>,
  point: Point,
  zoom: number,
): boolean {
  const handle = getLinearBendHandlePoint(element);
  return (
    handle !== null &&
    Math.hypot(point.x - handle.x, point.y - handle.y) * zoom <=
      HANDLE_HIT_RADIUS_PIXELS
  );
}

export function getLinearPointHandleAtPosition(
  element: Extract<Element, { type: "line" | "arrow" }>,
  point: Point,
  zoom: number,
): number | null {
  for (const handle of getLinearEndpointHandles(element)) {
    if (
      Math.hypot(point.x - handle.point.x, point.y - handle.point.y) * zoom <=
      HANDLE_HIT_RADIUS_PIXELS
    ) {
      return handle.pointIndex;
    }
  }
  return null;
}

export function getResizeHandleAtPosition(
  element: Element,
  point: Point,
  zoom: number,
): ResizeHandle | null {
  for (const { handle, point: handlePoint } of getResizeHandles(
    element,
    zoom,
  )) {
    const distanceInScreenPixels =
      Math.hypot(point.x - handlePoint.x, point.y - handlePoint.y) * zoom;

    if (distanceInScreenPixels <= HANDLE_HIT_RADIUS_PIXELS) {
      return handle;
    }
  }

  return null;
}
