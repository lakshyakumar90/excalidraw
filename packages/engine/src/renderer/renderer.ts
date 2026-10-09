import { visibleBounds, framePaintOrder } from "../scene/layout";
import type { Element, Viewport } from "@repo/common";
import { viewportToSceneBounds } from "./viewport";
import { getVisibleElements } from "./culling";

import { ElementBitmapCache } from "./elementBitmapCache";

import { drawArrow, drawCurvedLine, drawElement } from "./drawElements";
import { drawCachedShape } from "./bitmapRendering";
export { drawArrow, drawCurvedLine } from "./drawElements";
export { createElementBitmapCache } from "./bitmapRendering";

export interface RenderContext {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  viewport: Viewport;
}

export interface StaticRenderOptions {
  background?: boolean;
  grid?: boolean;
  origin?: boolean;
  bitmapCache?: ElementBitmapCache;
  pixelRatio?: number;
  bypassBitmapCache?: boolean;
}

//This moves the drawing context to the element’s center, rotates it, and moves back. The resulting transform matches the center-based rotation already used by getElementCorners.

function clearCanvas(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  context.clearRect(0, 0, width, height);
}

function drawBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  context.fillStyle = "#faf9f6";
  context.fillRect(0, 0, width, height);
}

function drawGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  viewport: Viewport,
): void {
  const baseGridSize = 20;

  let gridSize = baseGridSize;

  if (viewport.zoom < 0.5) {
    gridSize = baseGridSize * 2;
  }

  if (viewport.zoom < 0.25) {
    gridSize = baseGridSize * 4;
  }

  if (viewport.zoom > 2) {
    gridSize = baseGridSize / 2;
  }

  if (viewport.zoom > 4) {
    gridSize = baseGridSize / 4;
  }

  const scaledGridSize = gridSize * viewport.zoom;

  if (scaledGridSize < 8) {
    return;
  }

  context.save();

  context.strokeStyle = "#e5e5e5";
  context.lineWidth = 1;

  const offsetX =
    ((viewport.scrollX % scaledGridSize) + scaledGridSize) % scaledGridSize;

  const offsetY =
    ((viewport.scrollY % scaledGridSize) + scaledGridSize) % scaledGridSize;

  for (let x = offsetX; x <= width; x += scaledGridSize) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }

  for (let y = offsetY; y <= height; y += scaledGridSize) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  context.restore();
}

function drawOrigin(
  context: CanvasRenderingContext2D,
  viewport: Viewport,
): void {
  context.save();

  context.translate(viewport.scrollX, viewport.scrollY);
  context.scale(viewport.zoom, viewport.zoom);
  context.strokeStyle = "#999999";
  context.lineWidth = 1 / viewport.zoom;
  context.beginPath();
  context.moveTo(-20, 0);
  context.lineTo(20, 0);
  context.moveTo(0, -20);
  context.lineTo(0, 20);
  context.stroke();
  context.restore();
}

function applyViewportTransform(
  context: CanvasRenderingContext2D,
  viewport: Viewport,
): void {
  context.translate(viewport.scrollX, viewport.scrollY);
  context.scale(viewport.zoom, viewport.zoom);
}

export function renderStatic(
  renderContext: RenderContext,
  elements: readonly Element[],
  options: StaticRenderOptions = {},
  imageAssets: ReadonlyMap<string, CanvasImageSource> = new Map(),
): number {
  const { context, width, height, viewport } = renderContext;
  clearCanvas(context, width, height);
  if (options.background !== false) drawBackground(context, width, height);
  if (options.grid !== false) drawGrid(context, width, height, viewport);
  if (options.origin !== false) drawOrigin(context, viewport);

  const viewportBounds = viewportToSceneBounds({ width, height }, viewport);
  const frameMap = new Map(
    elements
      .filter((e) => e.type === "frame" && !e.isDeleted)
      .map((e) => [e.id, e]),
  );
  const visibleElements = getVisibleElements(
    framePaintOrder(elements),
    viewportBounds,
  ).filter((e) => visibleBounds(e, elements, frameMap));
  context.save();

  applyViewportTransform(context, viewport);

  for (const element of visibleElements) {
    const frame = frameMap.get(element.frameId ?? "");
    context.save();
    if (frame) {
      context.beginPath();
      context.rect(frame.x, frame.y, frame.width ?? 0, frame.height ?? 0);
      context.clip();
    }
    const cached =
      !options.bypassBitmapCache && options.bitmapCache
        ? drawCachedShape(
            context,
            element,
            elements,
            options.bitmapCache,
            viewport.zoom,
            options.pixelRatio ?? 1,
          )
        : false;
    if (!cached) drawElement(context, element, elements, imageAssets);
    context.restore();
  }
  context.restore();
  return visibleElements.length;
}

export function renderInteractive(
  renderContext: RenderContext,
  previewElement: Element | null = null,
): void {
  const { context, width, height } = renderContext;

  context.clearRect(0, 0, width, height);

  if (!previewElement) return;

  context.save();

  context.translate(
    renderContext.viewport.scrollX,
    renderContext.viewport.scrollY,
  );

  context.scale(renderContext.viewport.zoom, renderContext.viewport.zoom);
  context.globalAlpha = 0.6;
  context.setLineDash([6, 4]);
  drawElement(context, previewElement);

  context.restore();
}
