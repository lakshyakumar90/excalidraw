import type { Element } from "@repo/common";
import { renderSceneToSvg } from "@repo/engine";
import { downloadBlob } from "./excalidrawFile";

export function exportElementsToSvg(elements: readonly Element[]): void {
  const svg = renderSceneToSvg(elements, { background: "#ffffff" });
  downloadBlob(new Blob([svg], { type: "image/svg+xml" }), "drawing.svg");
}
