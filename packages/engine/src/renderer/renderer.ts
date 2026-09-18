import type { Element, Viewport } from "@repo/common";
import { viewportToSceneBounds } from "./viewport";
import { getVisibleElements } from "./culling";

export interface RenderContext {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  viewport: Viewport;
}

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
  context.fillStyle = "#ffffff";
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

function drawRectangle(
  context: CanvasRenderingContext2D,
  element: Extract<Element, { type: "rectangle" }>,
): void {
  const x = element.x ?? 0;
  const y = element.y ?? 0;
  const width = element.width ?? 0;
  const height = element.height ?? 0;
  const angle = element.angle ?? 0;
  const opacity = element.opacity ?? 100;
  const backgroundColor = element.backgroundColor ?? "transparent";
  const strokeColor = element.strokeColor ?? "#000000";
  const strokeWidth = element.strokeWidth ?? 1;

  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.globalAlpha = opacity / 100;

  if (backgroundColor !== "transparent") {
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, width, height);
  }

  context.strokeStyle = strokeColor;
  context.lineWidth = strokeWidth;
  context.strokeRect(0, 0, width, height);
  context.restore();
}

function drawElement(
  context: CanvasRenderingContext2D,
  element: Element,
): void {
  switch (element.type) {
    case "rectangle":
      drawRectangle(context, element);
      break;

    default:
      break;
  }
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
): void {
  const { context, width, height, viewport } = renderContext;
  clearCanvas(context, width, height);
  drawBackground(context, width, height);
  drawGrid(context, width, height, viewport);
  drawOrigin(context, viewport);

  const viewportBounds = viewportToSceneBounds({ width, height }, viewport);
  const visibleElements = getVisibleElements(elements, viewportBounds);
  context.save();

  applyViewportTransform(context, viewport);

  for (const element of visibleElements) {
    drawElement(context, element);
  }
  context.restore();
}

export function renderInteractive(renderContext: RenderContext): void {
  const { context, width, height } = renderContext;
  clearCanvas(context, width, height);
}
