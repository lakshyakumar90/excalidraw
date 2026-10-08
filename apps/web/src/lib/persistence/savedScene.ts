import type { Element, Viewport } from "@repo/common";
import type { SceneData, SceneFileData } from "@/lib/api/scenes";
import { createExcalidrawDocument, blobToDataUrl } from "./excalidrawFile";
import { loadFile, saveFile } from "./indexedDb";

export async function buildSavedSceneData(
  elements: readonly Element[],
  viewport: Viewport,
): Promise<SceneData> {
  const document = createExcalidrawDocument(elements, viewport);
  const imageIds = new Set(
    document.elements.flatMap((element) =>
      element.type === "image" ? [element.fileId] : [],
    ),
  );

  await Promise.all(
    [...imageIds].map(async (id) => {
      const file = await loadFile(id);
      if (!file) throw new Error(`The image file "${id}" is missing`);
      document.files[id] = {
        id,
        mimeType: file.mimeType,
        dataURL: await blobToDataUrl(file.blob),
        created: file.created,
      };
    }),
  );

  return document;
}

export async function cacheSavedSceneFiles(
  files: Record<string, SceneFileData> | undefined,
): Promise<void> {
  if (!files) return;
  await Promise.all(
    Object.values(files).map(async (file) => {
      if (!file.dataURL.startsWith("data:")) return;
      const response = await fetch(file.dataURL);
      const blob = await response.blob();
      await saveFile({
        id: file.id,
        blob,
        mimeType: file.mimeType || blob.type,
        created: file.created,
      });
    }),
  );
}
