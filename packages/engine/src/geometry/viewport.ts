import type { Point, Viewport } from "@repo/common/types";

export function sceneToViewport(
  point: Point,
  viewport: Viewport
): Point {
  return {
    x: point.x * viewport.zoom + viewport.scrollX,
    y: point.y * viewport.zoom + viewport.scrollY
  }
}

export function viewportToScene(
  point: Point,
  viewport: Viewport
): Point {
  return {
    x: (point.x - viewport.scrollX) / viewport.zoom,
    y: (point.y - viewport.scrollY) / viewport.zoom
  }
}