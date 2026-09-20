import type { Point } from "@repo/common";

function perpendicularDistance(
  point: Point,
  lineStart: Point,
  lineEnd: Point,
): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;

  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);
  }

  return (
    Math.abs(
      dy * point.x -
        dx * point.y +
        lineEnd.x * lineStart.y -
        lineEnd.y * lineStart.x,
    ) / Math.hypot(dx, dy)
  );
}

export function simplifyPoints(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) {
    return [...points];
  }

  const first = points[0];
  const last = points[points.length - 1];

  if (!first || !last) {
    return [...points];
  }

  let maxDistance = 0;
  let index = -1;

  for (let i = 1; i < points.length - 1; i += 1) {
    const point = points[i];

    if (!point) {
      continue;
    }

    const distance = perpendicularDistance(point, first, last);

    if (distance > maxDistance) {
      maxDistance = distance;
      index = i;
    }
  }

  if (maxDistance <= tolerance) {
    return [first, last];
  }

  // This should theoretically never happen because
  // there must be an interior point when maxDistance > tolerance.
  if (index === -1) {
    return [first, last];
  }

  const left = simplifyPoints(points.slice(0, index + 1), tolerance);
  const right = simplifyPoints(points.slice(index), tolerance);

  return [...left.slice(0, -1), ...right];
}
