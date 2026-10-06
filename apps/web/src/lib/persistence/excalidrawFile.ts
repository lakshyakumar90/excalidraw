import type { Element, Viewport } from "@repo/common";
import { loadFile } from "./indexedDb";

export interface ExcalidrawFileData {
  id: string;
  mimeType: string;
  dataURL: string;
  created: number;
}

export interface ExcalidrawDocument {
  type: "excalidraw";
  version: 2;
  source: "https://excalidraw.com";
  elements: Element[];
  appState: {
    scrollX: number;
    scrollY: number;
    zoom: { value: number };
    viewBackgroundColor: string;
  };
  files: Record<string, ExcalidrawFileData>;
}

export function createExcalidrawDocument(
  elements: readonly Element[],
  viewport: Viewport,
): ExcalidrawDocument {
  return {
    type: "excalidraw",
    version: 2,
    source: "https://excalidraw.com",
    elements: structuredClone(elements.filter((element) => !element.isDeleted)),
    appState: {
      scrollX: viewport.scrollX,
      scrollY: viewport.scrollY,
      zoom: { value: viewport.zoom },
      viewBackgroundColor: "#ffffff",
    },
  files: {},
  };
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Could not read an image for export"));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read an image for export"));
    reader.readAsDataURL(blob);
  });
}

export async function downloadExcalidrawFile(
  elements: readonly Element[],
  viewport: Viewport,
  fileName = "drawing.excalidraw",
): Promise<void> {
  const documentData = createExcalidrawDocument(elements, viewport);
  const fileIds = new Set(
    documentData.elements.flatMap((element) =>
      element.type === "image" ? [element.fileId] : [],
    ),
  );
  await Promise.all(
    [...fileIds].map(async (id) => {
      const file = await loadFile(id);
      if (!file) throw new Error(`The image file "${id}" is missing`);
      documentData.files[id] = {
        id,
        mimeType: file.mimeType,
        dataURL: await blobToDataUrl(file.blob),
        created: file.created,
      };
    }),
  );
  downloadBlob(
    new Blob([JSON.stringify(documentData, null, 2)], {
      type: "application/json",
    }),
    fileName,
  );
}
