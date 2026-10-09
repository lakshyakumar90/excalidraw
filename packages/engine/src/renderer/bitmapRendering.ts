import type { Element } from "@repo/common";

import { getElementLocalBounds } from "../geometry";

import {
  type ElementBitmap,
  ElementBitmapCache,
  createBitmapCanvas,
  quantizeZoom,
} from "./elementBitmapCache";

import { applyElementTransform, drawElement } from "./drawElements";
export function cachedShapeKey(
  element: Element,
  bucket: number,
  pixelRatio: number,
): string {
  return JSON.stringify([
    element.id,
    element.version,
    element.versionNonce,
    bucket,
    pixelRatio,
    element.type,
    element.width,
    element.height,
    element.type === "line" || element.type === "arrow"
      ? element.points
      : undefined,
    element.type === "line" || element.type === "arrow"
      ? element.lineType
      : undefined,
    element.seed,
    element.roughness,
    element.edgeStyle,
    element.fillStyle,
    element.backgroundColor,
    element.strokeColor,
    element.strokeWidth,
    element.strokeStyle,
  ]);
}

export function drawCachedShape(
  context: CanvasRenderingContext2D,
  element: Element,
  elements: readonly Element[],
  cache: ElementBitmapCache,
  zoom: number,
  pixelRatio: number,
): boolean {
  if (
    element.type !== "rectangle" &&
    element.type !== "ellipse" &&
    element.type !== "diamond" &&
    element.type !== "line" &&
    element.type !== "arrow"
  )
    return false;
  if (
    element.type === "arrow" &&
    elements.some(
      (candidate) =>
        candidate.type === "text" &&
        candidate.containerId === element.id &&
        !candidate.isDeleted,
    )
  )
    return false;
  const bucket = quantizeZoom(zoom);
  if (!bucket) return false;
  const ratio = Math.max(1, Math.min(3, pixelRatio));
  const scale = bucket * ratio;
  const arrowPadding =
    element.type === "arrow" ? Math.max(10, (element.strokeWidth ?? 1) * 4) : 0;
  const padding = Math.ceil(
    Math.max(
      5,
      (element.roughness ?? 1) * 4 +
        (element.strokeWidth ?? 1) * 3 +
        arrowPadding,
    ),
  );
  const localBounds = getElementLocalBounds(element);
  const isBox =
    element.type === "rectangle" ||
    element.type === "ellipse" ||
    element.type === "diamond";
  const minX = isBox ? 0 : localBounds.minX;
  const minY = isBox ? 0 : localBounds.minY;
  const localWidth = isBox
    ? Math.abs(element.width ?? 0)
    : Math.max(0, localBounds.maxX - localBounds.minX);
  const localHeight = isBox
    ? Math.abs(element.height ?? 0)
    : Math.max(0, localBounds.maxY - localBounds.minY);
  const logicalWidth = Math.max(1, localWidth) + padding * 2;
  const logicalHeight = Math.max(1, localHeight) + padding * 2;
  const width = Math.ceil(logicalWidth * scale);
  const height = Math.ceil(logicalHeight * scale);
  // Avoid browser canvas dimension limits and very large single-entry allocations.
  if (width > 2048 || height > 2048 || width * height > 2_000_000) return false;
  const key = cachedShapeKey(element, bucket, ratio);
  let bitmap = cache.get(key);
  if (!bitmap) {
    const canvas = createBitmapCanvas(width, height);
    const bitmapContext = canvas.getContext(
      "2d",
    ) as CanvasRenderingContext2D | null;
    if (!bitmapContext) return false;
    bitmapContext.setTransform(
      scale,
      0,
      0,
      scale,
      (padding - minX) * scale,
      (padding - minY) * scale,
    );
    const unrotated = {
      ...element,
      x: 0,
      y: 0,
      angle: 0,
      opacity: 100,
    } as Element;
    drawElement(bitmapContext, unrotated, [unrotated]);
    const created = canvas as unknown as ElementBitmap;
    if (!cache.set(key, created)) return false;
    bitmap = created;
  }
  if (!bitmap) return false;
  context.save();
  applyElementTransform(context, element);
  context.globalAlpha *= (element.opacity ?? 100) / 100;
  context.drawImage(
    bitmap,
    minX - padding,
    minY - padding,
    logicalWidth,
    logicalHeight,
  );
  context.restore();
  return true;
}

export function createElementBitmapCache(
  maxBytes?: number,
): ElementBitmapCache {
  return new ElementBitmapCache(maxBytes);
}
