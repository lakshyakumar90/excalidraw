import type { Element, Viewport } from "@repo/common";
import type { SceneData } from "@/lib/api/scenes";

export interface SavedCanvasScene {
  id: string;
  elements: Element[];
  viewport: Viewport;
  saveData?: (data: SceneData) => Promise<void>;
}
