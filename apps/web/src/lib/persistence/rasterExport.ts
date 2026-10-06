import type { Element } from "@repo/common";
import { getElementAxisAlignedBounds, renderStatic } from "@repo/engine";
import { downloadBlob } from "./excalidrawFile";

const PADDING = 24;
const MAX_SIDE = 16_000;

export interface PngExportOptions {
  scale: number;
  transparentBackground: boolean;
}

export async function exportElementsToPng(
  inputElements: readonly Element[],
  options: PngExportOptions,
): Promise<void> {
  const elements = inputElements.filter((element) => !element.isDeleted);
  if (elements.length === 0) throw new Error("There is nothing to export yet");

  const bounds = elements.map(getElementAxisAlignedBounds);
  const minX = Math.min(...bounds.map((item) => item.minX));
  const minY = Math.min(...bounds.map((item) => item.minY));
  const maxX = Math.max(...bounds.map((item) => item.maxX));
  const maxY = Math.max(...bounds.map((item) => item.maxY));
  const scale = Math.min(4, Math.max(0.5, options.scale));
  const width = Math.ceil((maxX - minX + PADDING * 2) * scale);
  const height = Math.ceil((maxY - minY + PADDING * 2) * scale);
  if (width > MAX_SIDE || height > MAX_SIDE) {
    throw new Error("The drawing is too large to export at this scale");
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare the PNG export");

  renderStatic(
    {
      context,
      width: canvas.width,
      height: canvas.height,
      viewport: {
        scrollX: (PADDING - minX) * scale,
        scrollY: (PADDING - minY) * scale,
        zoom: scale,
      },
    },
    elements,
    {
      background: !options.transparentBackground,
      grid: false,
      origin: false,
    },
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error("The browser could not encode the PNG export"));
    }, "image/png");
  });
  downloadBlob(blob, "drawing.png");
}
