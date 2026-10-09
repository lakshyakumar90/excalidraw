import type { Element, Viewport } from "@repo/common";
import type { SceneData } from "@/lib/api/scenes";

export interface SavedCanvasScene {
  id: string;
  elements: Element[];
  viewport: Viewport;
  saveData?: (data: SceneData) => Promise<void>;
  /**
   * Room sync mode: RoomSync owns initial content, the draft, and the
   * outbox, so persistence must not replaceAll or autosave here. Personal
   * and guest scenes omit this and keep the existing autosave path.
   */
  roomSync?: { roomId: string; sceneId: string };
}
