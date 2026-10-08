import type { Element, Viewport } from "@repo/common";

export interface SavedCanvasScene {
  id: string;
  elements: Element[];
  viewport: Viewport;
}
