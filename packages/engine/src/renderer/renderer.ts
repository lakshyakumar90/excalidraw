import type {
  ArrowElement,
  Element,
  FreedrawElement,
  LineElement,
  Viewport,
} from "@repo/common";
import { viewportToSceneBounds } from "./viewport";
import { getVisibleElements } from "./culling";
import { getArrowHeadPoints, sampleCatmullRom } from "../geometry";
import {
  buildStrokeOutline,
  getStrokeOutlinePath,
} from "../geometry/strokeOutline";

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

function drawEllipse(
  context: CanvasRenderingContext2D,
  element: Extract<Element, { type: "ellipse" }>,
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
  context.translate(x + width / 2, y + height / 2);
  context.rotate(angle);
  context.globalAlpha = opacity / 100;

  context.beginPath();
  context.ellipse(
    0,
    0,
    Math.abs(width) / 2,
    Math.abs(height) / 2,
    0,
    0,
    Math.PI * 2,
  );

  if (backgroundColor !== "transparent") {
    context.fillStyle = backgroundColor;
    context.fill();
  }

  context.strokeStyle = strokeColor;
  context.lineWidth = strokeWidth;
  context.stroke();
  context.restore();
}

function drawDiamond(
  context: CanvasRenderingContext2D,
  element: Extract<Element, { type: "diamond" }>,
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
  context.translate(x + width / 2, y + height / 2);
  context.rotate(angle);
  context.globalAlpha = opacity / 100;

  const halfWidth = Math.abs(width) / 2;
  const halfHeight = Math.abs(height) / 2;

  context.beginPath();
  context.moveTo(0, -halfHeight);
  context.lineTo(halfWidth, 0);
  context.lineTo(0, halfHeight);
  context.lineTo(-halfWidth, 0);
  context.closePath();

  if (backgroundColor !== "transparent") {
    context.fillStyle = backgroundColor;
    context.fill();
  }

  context.strokeStyle = strokeColor;
  context.lineWidth = strokeWidth;
  context.stroke();
  context.restore();
}

function drawLine(
  context: CanvasRenderingContext2D,
  element: Extract<Element, { type: "line" }>,
): void {
  const x = element.x ?? 0;
  const y = element.y ?? 0;
  const angle = element.angle ?? 0;
  const opacity = element.opacity ?? 100;
  const strokeColor = element.strokeColor ?? "#000000";
  const strokeWidth = element.strokeWidth ?? 1;
  const points = element.points ?? [];

  if (points.length < 2) {
    return;
  }

  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.globalAlpha = opacity / 100;
  context.strokeStyle = strokeColor;
  context.lineWidth = strokeWidth;
  context.beginPath();

  const firstPoint = points[0];

  if (!firstPoint) {
    context.restore();
    return;
  }

  context.moveTo(firstPoint.x, firstPoint.y);

  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];

    if (point) {
      context.lineTo(point.x, point.y);
    }
  }

  context.stroke();
  context.restore();
}

export function drawArrow(
  context: CanvasRenderingContext2D,
  element: ArrowElement,
): void {
  const points = element.points ?? [];

  if (points.length < 2) {
    return;
  }

  const start = points[0];
  const end = points[points.length - 1];
  const previous = points[points.length - 2];

  if (!start || !end || !previous) {
    return;
  }

  const x = element.x ?? 0;
  const y = element.y ?? 0;
  const angle = element.angle ?? 0;
  const opacity = element.opacity ?? 100;
  const strokeColor = element.strokeColor ?? "#000000";
  const strokeWidth = element.strokeWidth ?? 1;

  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.globalAlpha = opacity / 100;
  context.strokeStyle = strokeColor;
  context.lineWidth = strokeWidth;
  context.lineCap = "round";
  context.lineJoin = "round";

  // Body
  context.beginPath();
  context.moveTo(start.x, start.y);

  for (let i = 1; i < points.length; i += 1) {
    const point = points[i];

    if (!point) {
      continue;
    }

    context.lineTo(point.x, point.y);
  }

  context.stroke();

  // Arrowhead
  const arrowHead = getArrowHeadPoints(
    previous,
    end,
    Math.max(10, strokeWidth * 4),
  );

  if (arrowHead) {
    context.beginPath();

    context.moveTo(end.x, end.y);
    context.lineTo(arrowHead.left.x, arrowHead.left.y);

    context.moveTo(end.x, end.y);
    context.lineTo(arrowHead.right.x, arrowHead.right.y);

    context.stroke();
  }

  context.restore();
}

export function drawCurvedLine(
  context: CanvasRenderingContext2D,
  element: LineElement,
): void {
  const sourcePoints = element.points ?? [];

  if (sourcePoints.length < 2) {
    return;
  }

  const points = sampleCatmullRom(sourcePoints, 12);

  if (points.length < 2) {
    return;
  }

  const firstPoint = points[0];

  if (!firstPoint) {
    return;
  }

  const x = element.x ?? 0;
  const y = element.y ?? 0;
  const angle = element.angle ?? 0;
  const opacity = element.opacity ?? 100;
  const strokeColor = element.strokeColor ?? "#000000";
  const strokeWidth = element.strokeWidth ?? 1;

  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.globalAlpha = opacity / 100;
  context.strokeStyle = strokeColor;
  context.lineWidth = strokeWidth;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(firstPoint.x, firstPoint.y);

  for (let i = 1; i < points.length; i += 1) {
    const point = points[i];

    if (!point) {
      continue;
    }
    context.lineTo(point.x, point.y);
  }

  context.stroke();
  context.restore();
}

function drawFreedraw(
  context: CanvasRenderingContext2D,
  element: FreedrawElement,
): void {
  if (element.points.length < 2) {
    return;
  }

  const outline = buildStrokeOutline(element.points, element.strokeWidth ?? 1);
  const path = getStrokeOutlinePath(outline);

  if (path.length < 3) {
    return;
  }

  const firstPoint = path[0];

  if (!firstPoint) {
    return;
  }

  const x = element.x ?? 0;
  const y = element.y ?? 0;
  const angle = element.angle ?? 0;
  const opacity = element.opacity ?? 100;
  const strokeColor = element.strokeColor ?? "#000000";

  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.globalAlpha = opacity / 100;
  context.fillStyle = strokeColor;
  context.beginPath();
  context.moveTo(firstPoint.x, firstPoint.y);

  for (let i = 1; i < path.length; i += 1) {
    const point = path[i];

    if (!point) {
      continue;
    }

    context.lineTo(point.x, point.y);
  }
  context.closePath();
  context.fill();
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

    case "ellipse":
      drawEllipse(context, element);
      break;

    case "diamond":
      drawDiamond(context, element);
      break;

    case "line":
      if (element.lineType === "curved") {
        drawCurvedLine(context, element);
      } else {
        drawLine(context, element);
      }
      break;

    case "arrow":
      drawArrow(context, element);
      break;

    case "freedraw":
      drawFreedraw(context, element);
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
): number {
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
