import { apiRequest } from "@/lib/api/request";
import type { SavedScene, SceneData } from "@/lib/api/scenes";
import { loadScene } from "./indexedDb";
import { buildSavedSceneData } from "./savedScene";

export interface GuestDrawing {
  importKey: string;
  data: SceneData;
}

export async function readGuestDrawing(): Promise<GuestDrawing | null> {
  const local = await loadScene();
  if (!local?.elements.some((element) => !element.isDeleted)) return null;
  const data = await buildSavedSceneData(local.elements, local.viewport);
  // Ignore viewport-only changes when identifying an already imported drawing.
  // Sort image entries because file reads can finish in a different order.
  const identity = JSON.stringify({
    elements: data.elements,
    files: Object.entries(data.files ?? {}).sort(([a], [b]) =>
      a.localeCompare(b),
    ),
  });
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(identity),
  );
  const importKey = Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return { importKey, data };
}

export async function findGuestImport(importKey: string) {
  const result = await apiRequest<{ scene: SavedScene | null }>(
    `/scenes/guest-import/${importKey}`,
  );
  return result.scene;
}

export async function saveGuestDrawing(drawing: GuestDrawing) {
  const result = await apiRequest<{ scene: SavedScene }>(
    "/scenes/guest-import",
    {
      method: "POST",
      body: JSON.stringify({ title: "Guest drawing", ...drawing }),
    },
  );
  return result.scene;
}
