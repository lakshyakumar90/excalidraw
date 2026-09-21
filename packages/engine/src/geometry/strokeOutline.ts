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

function getCapTangent(a: Point, b: Point): Point {
  const t = normalize({ x: b.x - a.x, y: b.y - a.y });
  // normalize() falls back to {1,0} on zero length; guard the {0,0} path too.
  if (t.x === 0 && t.y === 0) return { x: 1, y: 0 };
  return t;
}

/** Interior points of a semicircular cap (excludes the two corner endpoints). */
function capArc(
  center: Point,
  normal: Point,
  tangent: Point,
  radius: number,
  segments: number,
  sign: 1 | -1,
): Point[] {
  const arc: Point[] = [];
  for (let i = 1; i < segments; i += 1) {
    const theta = (Math.PI * i) / segments;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    arc.push({
      x: center.x + radius * (normal.x * cos + sign * tangent.x * sin),
      y: center.y + radius * (normal.y * cos + sign * tangent.y * sin),
    });
  }
  return arc;
}

/**
 * Full closed stroke path with round caps:
 * left[0..n] → end cap → right[n..0] → start cap → close.
 */
export function buildClosedStrokePath(
  points: FreedrawPoint[],
  baseWidth: number,
  capSegments = 8,
): Point[] {
  const outline = buildStrokeOutline(points, baseWidth);
  if (outline.left.length === 0 || outline.right.length === 0) return [];
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return [];

  const startTangent = getCapTangent(first, points[1] ?? first);
  const endTangent = getCapTangent(points[points.length - 2] ?? last, last);
  const startNormal = getNormal(startTangent);
  const endNormal = getNormal(endTangent);
  const startRadius = getRadius(baseWidth, first.pressure);
  const endRadius = getRadius(baseWidth, last.pressure);
  const segments = Math.max(2, Math.floor(capSegments));

  return [
    ...outline.left,
    ...capArc(last, endNormal, endTangent, endRadius, segments, 1),
    ...outline.right.reverse(),
    ...capArc(first, startNormal, startTangent, startRadius, segments, -1),
  ];
}
