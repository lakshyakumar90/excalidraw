import { uploadImageViaPresign } from "@/lib/api/files";

export interface GeneratedThumbnail {
  dataUrl: string;
  remoteUrl?: string;
  fileId?: string;
}

/**
 * Renders a lightweight 320x180 WebP (or PNG fallback) preview from an active
 * HTMLCanvasElement, optionally uploading via Phase 1.3 presigned storage.
 */
export async function generateBoardThumbnail(
  sourceCanvas: HTMLCanvasElement,
  options?: { upload?: boolean; width?: number; height?: number },
): Promise<GeneratedThumbnail | null> {
  const width = options?.width ?? 320;
  const height = options?.height ?? 180;
  if (typeof document === "undefined") return null;

  const offscreen = document.createElement("canvas");
  offscreen.width = width;
  offscreen.height = height;
  const ctx = offscreen.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(sourceCanvas, 0, 0, width, height);

  let dataUrl = offscreen.toDataURL("image/webp", 0.72);
  if (!dataUrl.startsWith("data:image/webp")) {
    dataUrl = offscreen.toDataURL("image/png");
  }

  if (!options?.upload) {
    return { dataUrl };
  }

  try {
    const blob = await new Promise<Blob | null>((resolve) =>
      offscreen.toBlob((b) => resolve(b), "image/webp", 0.72),
    );
    if (!blob) return { dataUrl };
    const uploaded = await uploadImageViaPresign(blob, { width, height });
    if (!uploaded) return { dataUrl };
    return {
      dataUrl,
      remoteUrl: uploaded.downloadUrl,
      fileId: uploaded.fileId,
    };
  } catch {
    return { dataUrl };
  }
}
