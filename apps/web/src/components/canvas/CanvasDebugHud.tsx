"use client";

import type { CanvasDebugState } from "../../types/canvas/types";

interface CanvasDebugHudProps {
  debug: CanvasDebugState;
}

export function CanvasDebugHud({ debug }: CanvasDebugHudProps) {
  return (
    <div
      className="
        pointer-events-none
        fixed left-3 top-3 z-50
        min-w-52
        rounded-lg
        border border-neutral-200
        bg-white/90
        px-3 py-2
        font-mono text-xs
        leading-5 text-neutral-700
        shadow-sm
        backdrop-blur-sm
      "
    >
      <div>Zoom: {(debug.viewport.zoom * 100).toFixed(0)}%</div>

      <div>
        Scroll: {debug.viewport.scrollX.toFixed(1)}
        {" / "}
        {debug.viewport.scrollY.toFixed(1)}
      </div>

      <div>
        Pointer: {debug.pointer.x.toFixed(1)}
        {" / "}
        {debug.pointer.y.toFixed(1)}
      </div>

      <div>
        Scene: {debug.scenePointer.x.toFixed(1)}
        {" / "}
        {debug.scenePointer.y.toFixed(1)}
      </div>

      <div>Elements: {debug.elementCount}</div>

      <div>FPS: {debug.fps}</div>
    </div>
  );
}
