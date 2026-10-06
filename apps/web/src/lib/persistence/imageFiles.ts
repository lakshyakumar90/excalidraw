import type { Element, Point } from "@repo/common";
import { createImageElement } from "@repo/engine";
import { loadFile, saveFile } from "./indexedDb";

const MAX_IMAGE_SIDE = 600;

export async function createImageElementFromFile(
  file: File,
  center: Point,
): Promise<Element> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file to add to the canvas");
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(
    1,
    MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height),
  );
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  bitmap.close();

  const fileId = crypto.randomUUID();
  await saveFile({
    id: fileId,
    blob: file,
    mimeType: file.type,
    created: Date.now(),
  });

  return createImageElement({
    fileId,
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
  });
}

export async function loadImageAsset(fileId: string): Promise<ImageBitmap | null> {
  const file = await loadFile(fileId);
  if (!file) return null;
  return createImageBitmap(file.blob);
}

export async function loadImageAssets(
  elements: readonly Element[],
): Promise<Map<string, ImageBitmap>> {
  const ids = new Set(
    elements.flatMap((element) =>
      element.type === "image" && !element.isDeleted ? [element.fileId] : [],
    ),
  );
  const assets = new Map<string, ImageBitmap>();
  try {
    await Promise.all(
      [...ids].map(async (id) => {
        const bitmap = await loadImageAsset(id);
        if (bitmap) assets.set(id, bitmap);
      }),
    );
  } catch (error) {
    for (const bitmap of assets.values()) bitmap.close();
    throw error;
  }
  return assets;
}
