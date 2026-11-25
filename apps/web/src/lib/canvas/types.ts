import type { Element, Viewport } from "@repo/common";
import type { SceneData } from "@/lib/api/scenes";

export interface SavedCanvasScene {
  id: string;
  title?: string;
  elements: Element[];
  viewport: Viewport;
  appState?: SceneData["appState"];
  files?: SceneData["files"];
  saveData?: (data: SceneData) => Promise<void>;
  /**
   * Room sync mode: RoomSync owns initial content, the draft, and the
   * outbox, so persistence must not replaceAll or autosave here. Personal
   * and guest scenes omit this and keep the existing autosave path.
   */
  roomSync?: { roomId: string; sceneId: string };
}
