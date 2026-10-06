import type { Element } from "@repo/common";
import { renderSceneToSvg } from "@repo/engine";
import { blobToDataUrl, downloadBlob } from "./excalidrawFile";
import { loadFile } from "./indexedDb";

export async function exportElementsToSvg(
  elements: readonly Element[],
): Promise<void> {
  const imageIds = new Set(
    elements.flatMap((element) =>
      element.type === "image" && !element.isDeleted ? [element.fileId] : [],
    ),
  );
  const imageFiles = new Map<string, string>();
  await Promise.all(
    [...imageIds].map(async (id) => {
      const file = await loadFile(id);
      if (!file) throw new Error(`The image file "${id}" is missing`);
      imageFiles.set(id, await blobToDataUrl(file.blob));
    }),
  );
  const svg = renderSceneToSvg(elements, {
    background: "#ffffff",
    imageFiles,
  });
  downloadBlob(new Blob([svg], { type: "image/svg+xml" }), "drawing.svg");
}
