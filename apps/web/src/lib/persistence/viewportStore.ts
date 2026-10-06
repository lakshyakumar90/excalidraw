import type { Viewport } from "@repo/common";

let currentViewport: Viewport = { scrollX: 0, scrollY: 0, zoom: 1 };

export function getCurrentViewport(): Viewport {
  return { ...currentViewport };
}

export function setCurrentViewport(viewport: Viewport): void {
  currentViewport = { ...viewport };
}
