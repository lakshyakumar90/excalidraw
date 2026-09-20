import type { Point } from "@repo/common";

export interface ArrowHeadPoints {
  left: Point;
  right: Point;
}

export function getArrowHeadPoints(
  start: Point,
  end: Point,
  size: number,
): ArrowHeadPoints | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  const length = Math.hypot(dx, dy);

  if (length === 0) {
    return null;
  }

  const ux = dx / length;
  const uy = dy / length;
  const px = -uy;
  const py = ux;

  const width = size * 0.55;

  const left: Point = {
    x: end.x - ux * size + px * width,
    y: end.y - uy * size + py * width,
  };

  const right: Point = {
    x: end.x - ux * size - px * width,
    y: end.y - uy * size - py * width,
  };

  return {
    left,
    right,
  };
}
