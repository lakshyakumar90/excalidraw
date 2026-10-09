import { MAX_ZOOM, MIN_ZOOM, type Viewport } from "@repo/common";

/**
 * Center the local view on a participant's shared scene center, adopting
 * their zoom within local bounds. Uses the local canvas size so jumps land
 * on the same scene area across different browser window sizes.
 */
export function computeJumpViewport(
  target: { x: number; y: number; zoom: number },
  canvasSize: { width: number; height: number },
): Viewport {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, target.zoom));
  return {
    scrollX: canvasSize.width / 2 - target.x * zoom,
    scrollY: canvasSize.height / 2 - target.y * zoom,
    zoom,
  };
}
