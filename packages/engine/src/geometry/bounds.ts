import type { Point } from "@repo/common";

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function createEmptyBounds(): Bounds {
  return {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
}

export function expandBounds(bounds: Bounds, point: Point): Bounds {
  return {
    minX: Math.min(bounds.minX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x),
    maxY: Math.max(bounds.maxY, point.y),
  };
}

export function boundsFromPoints(points: readonly Point[]): Bounds {
  if (points.length === 0) return createEmptyBounds();
  let bounds = createEmptyBounds();

  for (const point of points) {
    bounds = expandBounds(bounds, point);
  }
  return bounds;
}

export function getBoundsWidth(bounds: Bounds): number {
  if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.maxX)) return 0;
  return bounds.maxX - bounds.minX;
}

export function getBoundsHeight(bounds: Bounds): number {
  if (!Number.isFinite(bounds.minY) || !Number.isFinite(bounds.maxY)) return 0;
  return bounds.maxY - bounds.minY;
}

export function getBoundsCenter(bounds: Bounds): Point {
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
}

export function isPointInsideBounds(
  point: Point,
  bounds: Bounds,
  padding = 0,
): boolean {
  return (
    point.x >= bounds.minX - padding &&
    point.x <= bounds.maxX + padding &&
    point.y >= bounds.minY - padding &&
    point.y <= bounds.maxY + padding
  );
}


