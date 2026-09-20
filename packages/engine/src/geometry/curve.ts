import type { Point } from "@repo/common";

export function getCatmullRomPoint(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  t: number,
): Point {
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),

    y:
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

export function sampleCatmullRom(
  points: Point[],
  samplesPerSegment = 12,
): Point[] {
  if (points.length < 2) {
    return [...points];
  }

  if (points.length === 2) {
    return [...points];
  }

  const result: Point[] = [];

  for (let i = 0; i < points.length - 1; i += 1) {
    const p1 = points[i];
    const p2 = points[i + 1];

    if (!p1 || !p2) {
      continue;
    }

    const p0 = points[i - 1] ?? p1;
    const p3 = points[i + 2] ?? p2;

    for (let step = 0; step < samplesPerSegment; step += 1) {
      const t = step / samplesPerSegment;
      result.push(getCatmullRomPoint(p0, p1, p2, p3, t));
    }
  }

  const lastPoint = points[points.length - 1];

  if (lastPoint) {
    result.push(lastPoint);
  }

  return result;
}
