import type { Point } from "@repo/common";

export interface PolylineBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getPolylineBounds(points: readonly Point[]): PolylineBounds {
  if (points.length === 0) {
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    };
  }

  const firstPoint = points[0];

  if (!firstPoint) {
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    };
  }

  let minX = firstPoint.x;
  let minY = firstPoint.y;
  let maxX = firstPoint.x;
  let maxY = firstPoint.y;

  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];

    if (!point) {
      continue;
    }

    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function toLocalPoints(
  points: readonly Point[],
  bounds: PolylineBounds,
): Point[] {
  return points.map((point) => ({
    x: point.x - bounds.x,
    y: point.y - bounds.y,
  }));
}
