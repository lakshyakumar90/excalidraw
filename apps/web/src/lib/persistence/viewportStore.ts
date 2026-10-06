import type { Viewport } from "@repo/common";

const INITIAL_VIEWPORT: Viewport = { scrollX: 0, scrollY: 0, zoom: 1 };
let currentViewport: Viewport = INITIAL_VIEWPORT;
const listeners = new Set<() => void>();

export function getCurrentViewport(): Viewport {
  return currentViewport;
}

export function subscribeViewport(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setCurrentViewport(viewport: Viewport): void {
  if (
    currentViewport.scrollX === viewport.scrollX &&
    currentViewport.scrollY === viewport.scrollY &&
    currentViewport.zoom === viewport.zoom
  ) {
    return;
  }
  currentViewport = { ...viewport };
  for (const listener of listeners) listener();
}

export function getInitialViewport(): Viewport {
  return INITIAL_VIEWPORT;
}
