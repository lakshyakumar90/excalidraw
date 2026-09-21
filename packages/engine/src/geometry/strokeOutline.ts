import type { FreedrawPoint, Point } from "@repo/common";
import { getPressureWidth } from "./stroke";

export interface StrokeOutline {
  left: Point[];
  right: Point[];
}

function getRadius(baseWidth: number, pressure: number): number {
  return getPressureWidth(baseWidth, pressure) / 2;
}

function normalize(vector: Point): Point {
  const length = Math.hypot(vector.x, vector.y);

  if (length === 0) {
    return { x: 1, y: 0 };
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

function getTangent(points: FreedrawPoint[], index: number): Point {
  const current = points[index];

  if (!current) {
    return { x: 0, y: 0 };
  }

  if (index === 0) {
    const next = points[1];

    if (!next) {
      return { x: 0, y: 0 };
    }

    return normalize({
      x: next.x - current.x,
      y: next.y - current.y,
    });
  }

  if (index === points.length - 1) {
    const previous = points[index - 1];

    if (!previous) {
      return { x: 0, y: 0 };
    }

    return normalize({
      x: current.x - previous.x,
      y: current.y - previous.y,
    });
  }

  const previous = points[index - 1];
  const next = points[index + 1];

  if (!previous || !next) {
    return { x: 0, y: 0 };
  }

  return normalize({
    x: next.x - previous.x,
    y: next.y - previous.y,
  });
}

function getNormal(tangent: Point): Point {
  return {
    x: -tangent.y,
    y: tangent.x,
  };
}

export function buildStrokeOutline(
  points: FreedrawPoint[],
  baseWidth: number,
): StrokeOutline {
  if (points.length < 2) {
    return {
      left: [],
      right: [],
    };
  }

  const left: Point[] = [];
  const right: Point[] = [];

  for (const [index, point] of points.entries()) {
    const tangent = getTangent(points, index);
    const normal = getNormal(tangent);
    const radius = getRadius(baseWidth, point.pressure);

    left.push({
      x: point.x + normal.x * radius,
      y: point.y + normal.y * radius,
    });

    right.push({
      x: point.x - normal.x * radius,
      y: point.y - normal.y * radius,
    });
  }

  return {
    left,
    right,
  };
}

export function getStrokeOutlinePath(outline: StrokeOutline): Point[] {
  if (outline.left.length === 0 || outline.right.length === 0) {
    return [];
  }

  return [...outline.left, ...outline.right.reverse()];
}
