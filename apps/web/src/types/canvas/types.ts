import type { Point, Viewport } from "@repo/common";

export interface CanvasDebugState {
  viewport: Viewport;
  pointer: Point;
  scenePointer: Point;
  elementCount: number;
  fps: number;
}