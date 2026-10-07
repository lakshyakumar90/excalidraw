import type { FreedrawPoint, Point } from "@repo/common";
import { sampleCatmullRom } from "./curve";
import { getPressureWidth } from "./stroke";

const SMOOTH_SAMPLES_PER_SEGMENT = 8;

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
  const smoothedPoints = smoothFreedrawPoints(points);
  const outline = buildStrokeOutline(smoothedPoints, baseWidth);
  if (outline.left.length === 0 || outline.right.length === 0) return [];
  const first = smoothedPoints[0];
  const last = smoothedPoints[smoothedPoints.length - 1];
  if (!first || !last) return [];

  const startTangent = getCapTangent(first, smoothedPoints[1] ?? first);
  const endTangent = getCapTangent(
    smoothedPoints[smoothedPoints.length - 2] ?? last,
    last,
  );
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

export function smoothFreedrawPoints(
  points: readonly FreedrawPoint[],
): FreedrawPoint[] {
  if (points.length < 3) return points.map((point) => ({ ...point }));

  const filtered = points.map((point, index) => {
    if (index === 0 || index === points.length - 1) return { ...point };

    const neighbors = [
      { offset: -2, weight: 1 },
      { offset: -1, weight: 2 },
      { offset: 0, weight: 4 },
      { offset: 1, weight: 2 },
      { offset: 2, weight: 1 },
    ];
    let weightedX = 0;
    let weightedY = 0;
    let totalWeight = 0;

    for (const { offset, weight } of neighbors) {
      const neighbor =
        points[Math.max(0, Math.min(points.length - 1, index + offset))];
      if (!neighbor) continue;
      weightedX += neighbor.x * weight;
      weightedY += neighbor.y * weight;
      totalWeight += weight;
    }

    const smoothedX = weightedX / totalWeight;
    const smoothedY = weightedY / totalWeight;
    return {
      ...point,
      x: point.x * 0.35 + smoothedX * 0.65,
      y: point.y * 0.35 + smoothedY * 0.65,
    };
  });

  const sampled = sampleCatmullRom(filtered, SMOOTH_SAMPLES_PER_SEGMENT);
  const finalIndex = sampled.length - 1;

  return sampled.map((point, index) => {
    if (index === finalIndex) {
      return { ...point, pressure: points[points.length - 1]!.pressure };
    }

    const segmentIndex = Math.min(
      points.length - 2,
      Math.floor(index / SMOOTH_SAMPLES_PER_SEGMENT),
    );
    const segmentProgress =
      (index - segmentIndex * SMOOTH_SAMPLES_PER_SEGMENT) /
      SMOOTH_SAMPLES_PER_SEGMENT;
    const startPressure = points[segmentIndex]!.pressure;
    const endPressure = points[segmentIndex + 1]!.pressure;

    return {
      ...point,
      pressure:
        startPressure + (endPressure - startPressure) * segmentProgress,
    };
  });
}
