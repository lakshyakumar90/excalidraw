import type { RenderLoopStats } from "@repo/engine";

export interface RenderDiagnostics {
  fps: number;
  frameCount: number;
  staticRenderCount: number;
  interactiveRenderCount: number;
  sceneElementCount: number;
  visibleElementCount: number;
  zoom: number;
}

const INITIAL_DIAGNOSTICS: RenderDiagnostics = {
  fps: 0,
  frameCount: 0,
  staticRenderCount: 0,
  interactiveRenderCount: 0,
  sceneElementCount: 0,
  visibleElementCount: 0,
  zoom: 1,
};

let snapshot = INITIAL_DIAGNOSTICS;

const subscribers = new Set<() => void>();

export const renderDiagnostics = {
  subscribe(listener: () => void) {
    subscribers.add(listener);

    return () => {
      subscribers.delete(listener);
    };
  },

  getSnapshot() {
    return snapshot;
  },

  update(
    stats: RenderLoopStats,
    sceneElementCount: number,
    visibleElementCount: number,
    zoom: number,
  ) {
    snapshot = {
      fps: stats.fps,
      frameCount: stats.frameCount,
      staticRenderCount: stats.staticRenderCount,
      interactiveRenderCount: stats.interactiveRenderCount,
      sceneElementCount,
      visibleElementCount,
      zoom,
    };

    for (const subscriber of subscribers) {
      subscriber();
    }
  },
};
