import type { Point } from "@repo/common";

export function rotatePoint(point: Point, angle: number, center: Point): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const dx = point.x - center.x;
  const dy = point.y - center.y;

  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

export function rotatePoints(
  points: readonly Point[],
  angle: number,
  center: Point,
): Point[] {
  return points.map((point) => rotatePoint(point, angle, center));
}
