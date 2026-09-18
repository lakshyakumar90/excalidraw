"use client";

import { useSyncExternalStore } from "react";

import { renderDiagnostics } from "@/lib/canvas/renderDiagnostics";

function formatFps(fps: number): string {
  if (fps === 0) {
    return "--";
  }

  return fps.toFixed(0);
}

function formatZoom(zoom: number): string {
  return `${(zoom * 100).toFixed(0)}%`;
}

export function CanvasDiagnostics() {
  const diagnostics = useSyncExternalStore(
    renderDiagnostics.subscribe,
    renderDiagnostics.getSnapshot,
    renderDiagnostics.getSnapshot,
  );

  return (
    <div className="fixed bottom-4 left-4 z-50 rounded-lg border border-black/10 bg-white/95 px-3 py-2 font-mono text-xs text-neutral-800 shadow-sm backdrop-blur">
      <div>
        FPS: <span className="font-semibold">{formatFps(diagnostics.fps)}</span>
      </div>

      <div>
        Frames: <span className="font-semibold">{diagnostics.frameCount}</span>
      </div>

      <div>
        Static renders:{" "}
        <span className="font-semibold">{diagnostics.staticRenderCount}</span>
      </div>

      <div>
        Interactive renders:{" "}
        <span className="font-semibold">
          {diagnostics.interactiveRenderCount}
        </span>
      </div>

      <div>
        Elements:{" "}
        <span className="font-semibold">{diagnostics.sceneElementCount}</span>
      </div>

      <div>
        Visible:{" "}
        <span className="font-semibold">{diagnostics.visibleElementCount}</span>
      </div>

      <div>
        Zoom:{" "}
        <span className="font-semibold">{formatZoom(diagnostics.zoom)}</span>
      </div>
    </div>
  );
}
