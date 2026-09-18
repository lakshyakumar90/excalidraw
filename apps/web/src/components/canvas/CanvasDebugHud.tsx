"use client";

import type { Point, Viewport } from "@repo/common";

interface CanvasDebugHudProps {
  viewport: Viewport;
  pointer: Point;
  scenePointer: Point;
  fps: number;
  elementCount: number;
}

export function CanvasDebugHud({
  viewport,
  pointer,
  scenePointer,
  fps,
  elementCount,
}: CanvasDebugHudProps) {
  return (
    <div
      className="
        pointer-events-none
        fixed left-3 top-3 z-50
        rounded-lg
        border border-neutral-200
        bg-white/90
        px-3 py-2
        font-mono text-xs
        leading-5
        text-neutral-700
        shadow-sm
        backdrop-blur
      "
    >
      <div>Zoom: {(viewport.zoom * 100).toFixed(0)}%</div>

      <div>
        Scroll: {viewport.scrollX.toFixed(1)}
        {" / "}
        {viewport.scrollY.toFixed(1)}
      </div>

      <div>
        Pointer: {pointer.x.toFixed(1)}
        {" / "}
        {pointer.y.toFixed(1)}
      </div>

      <div>
        Scene: {scenePointer.x.toFixed(1)}
        {" / "}
        {scenePointer.y.toFixed(1)}
      </div>

      <div>Elements: {elementCount}</div>

      <div>FPS: {fps}</div>
    </div>
  );
}
