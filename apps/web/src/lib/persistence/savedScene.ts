import type { Element, Viewport } from "@repo/common";
import type { SceneData, SceneFileData } from "@/lib/api/scenes";
import { createExcalidrawDocument, blobToDataUrl } from "./excalidrawFile";
import { loadFile, saveFile } from "./indexedDb";
import { apiRequest } from "@/lib/api/request";
import { uploadImageViaPresign } from "@/lib/api/files";

export async function buildSavedSceneData(
  elements: readonly Element[],
  viewport: Viewport,
  remoteFiles?: Map<string, SceneFileData>,
): Promise<SceneData> {
  const document = createExcalidrawDocument(elements, viewport);
  const imageIds = new Set(
    document.elements.flatMap((element) =>
      element.type === "image" ? [element.fileId] : [],
    ),
  );

  await Promise.all(
    [...imageIds].map(async (id) => {
      const saved = remoteFiles?.get(id);
      if (saved) {
        document.files[id] = saved;
        return;
      }
      const file = await loadFile(id);
      if (!file) throw new Error(`The image file "${id}" is missing`);
      const uploaded = remoteFiles ? await uploadImageViaPresign(file.blob, undefined, true) : undefined;
      document.files[id] = {
        id,
        mimeType: file.mimeType,
        dataURL: uploaded ? `/api/files/${encodeURIComponent(uploaded.fileId)}` : await blobToDataUrl(file.blob),
        created: file.created,
      };
      if (uploaded) remoteFiles?.set(id, document.files[id]);
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
      const stored = /^\/api\/files\/[\w-]+$/.test(file.dataURL);
      if (!stored && !file.dataURL.startsWith("data:")) return;
      const url = stored ? (await apiRequest<{ url: string }>(`${file.dataURL}?url=1`)).url : file.dataURL;
      const response = await fetch(url, { credentials: "omit" });
      if (!response.ok) throw new Error(`Could not load image "${file.id}"`);
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
