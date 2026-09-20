import type { Point } from "@repo/common";

export interface LineBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getLineBounds(start: Point, end: Point): LineBounds {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);

  return {
    x,
    y,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

export function getLinePoints(
  start: Point,
  end: Point,
  bounds: LineBounds,
): Point[] {
  return [
    {
      x: start.x - bounds.x,
      y: start.y - bounds.y,
    },
    {
      x: end.x - bounds.x,
      y: end.y - bounds.y,
    },
  ];
}
