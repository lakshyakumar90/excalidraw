import type { Viewport } from "@repo/common";
/** Frame-rate-independent follow easing; reduced motion adopts the target directly. */
export function easeFollowViewport(
  current: Viewport,
  target: Viewport,
  elapsedMs: number,
  reducedMotion = false,
): Viewport {
  const t = reducedMotion
    ? 1
    : 1 - Math.exp(-Math.max(0, Math.min(100, elapsedMs)) / 80);
  return {
    zoom: current.zoom + (target.zoom - current.zoom) * t,
    scrollX: current.scrollX + (target.scrollX - current.scrollX) * t,
    scrollY: current.scrollY + (target.scrollY - current.scrollY) * t,
  };
}
