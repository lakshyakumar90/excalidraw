import type { ArrowElement, Point } from "@repo/common";
import { boundsFromPoints, getBoundsCenter } from "./bounds";
import { rotatePoint } from "./rotation";

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

/** Returns the path-length midpoint in scene coordinates for an arrow. */
export function getArrowMidpoint(arrow: ArrowElement): Point {
  const points = arrow.points;
  if (points.length === 0) return { x: arrow.x, y: arrow.y };

  const lengths = points.slice(1).map((point, index) => {
    const previous = points[index]!;
    return Math.hypot(point.x - previous.x, point.y - previous.y);
  });
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);
  let localMidpoint = points[0]!;

  if (totalLength > 0) {
    let remaining = totalLength / 2;
    for (let index = 0; index < lengths.length; index += 1) {
      const length = lengths[index]!;
      const start = points[index]!;
      const end = points[index + 1]!;
      if (remaining <= length) {
        const ratio = length === 0 ? 0 : remaining / length;
        localMidpoint = {
          x: start.x + (end.x - start.x) * ratio,
          y: start.y + (end.y - start.y) * ratio,
        };
        break;
      }
      remaining -= length;
    }
  }

  const bounds = boundsFromPoints(points);
  const rotated = rotatePoint(
    localMidpoint,
    arrow.angle ?? 0,
    getBoundsCenter(bounds),
  );
  return { x: arrow.x + rotated.x, y: arrow.y + rotated.y };
}
