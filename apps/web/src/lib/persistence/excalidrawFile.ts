import type { Element, Viewport } from "@repo/common";

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
  files: Record<string, never>;
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

export function downloadExcalidrawFile(
  elements: readonly Element[],
  viewport: Viewport,
  fileName = "drawing.excalidraw",
): void {
  const documentData = createExcalidrawDocument(elements, viewport);
  downloadBlob(
    new Blob([JSON.stringify(documentData, null, 2)], {
      type: "application/json",
    }),
    fileName,
  );
}
