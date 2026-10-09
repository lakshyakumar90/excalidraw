import type { Point } from "@repo/common";

/**
 * Advance a displayed cursor toward its latest target with frame-rate
 * independent exponential smoothing. Pure and unit-tested; the component
 * drives it from requestAnimationFrame with the real elapsed time.
 */
export function stepCursorTowards(
  current: Point,
  target: Point,
  elapsedMs: number,
  smoothing = 14,
): Point {
  if (elapsedMs <= 0) return current;
  const factor = 1 - Math.exp((-smoothing * elapsedMs) / 1000);
  const clamped = Math.min(1, Math.max(0, factor));
  return {
    x: current.x + (target.x - current.x) * clamped,
    y: current.y + (target.y - current.y) * clamped,
  };
}
