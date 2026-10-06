import type {
  ArrowElement,
  Element,
  FreedrawElement,
  LineElement,
  Point,
  Viewport,
} from "@repo/common";
import { viewportToSceneBounds } from "./viewport";
import { getVisibleElements } from "./culling";
import {
  getArrowHeadPoints,
  getBoundsCenter,
  getElementLocalBounds,
  sampleCatmullRom,
} from "../geometry";
import { buildClosedStrokePath } from "../geometry/strokeOutline";
import {
  DEFAULT_TEXT_FONT_FAMILY,
  DEFAULT_TEXT_FONT_SIZE,
  measureText,
} from "../text";

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
}

//This moves the drawing context to the element’s center, rotates it, and moves back. The resulting transform matches the center-based rotation already used by getElementCorners.

function applyElementTransform(
  context: CanvasRenderingContext2D,
  element: Element,
): void {
  const localBounds = getElementLocalBounds(element);
  const center = getBoundsCenter(localBounds);

  context.translate(element.x + center.x, element.y + center.y);
  context.rotate(element.angle ?? 0);
  context.translate(-center.x, -center.y);
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

interface LocalBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function getRoundedPolygonPoints(
  vertices: readonly Point[],
  radius: number,
): Point[] {
  if (radius <= 0) return [...vertices];

  const points: Point[] = [];
  const steps = 5;

  for (let index = 0; index < vertices.length; index += 1) {
    const previous = vertices[(index - 1 + vertices.length) % vertices.length];
    const current = vertices[index];
    const next = vertices[(index + 1) % vertices.length];
    if (!previous || !current || !next) continue;

    const incomingLength = Math.hypot(
      current.x - previous.x,
      current.y - previous.y,
    );
    const outgoingLength = Math.hypot(next.x - current.x, next.y - current.y);
    const inset = Math.min(radius, incomingLength / 2, outgoingLength / 2);
    const start = {
      x: current.x + ((previous.x - current.x) / incomingLength) * inset,
      y: current.y + ((previous.y - current.y) / incomingLength) * inset,
    };
    const end = {
      x: current.x + ((next.x - current.x) / outgoingLength) * inset,
      y: current.y + ((next.y - current.y) / outgoingLength) * inset,
    };

    points.push(start);
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      const inverse = 1 - t;
      points.push({
        x:
          inverse * inverse * start.x +
          2 * inverse * t * current.x +
          t * t * end.x,
        y:
          inverse * inverse * start.y +
          2 * inverse * t * current.y +
          t * t * end.y,
      });
    }
  }

  return points;
}

function getRoughPathPoints(
  points: readonly Point[],
  closed: boolean,
  element: Element,
): Point[] {
  const roughness = Math.max(0, element.roughness ?? 0);
  if (roughness === 0 || points.length < 2) return [...points];

  let state = (element.seed ?? 1) >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  const random = () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };

  const amplitude = Math.min(4, roughness * 0.8);
  const result: Point[] = [];
  const segmentCount = closed ? points.length : points.length - 1;

  for (let index = 0; index < segmentCount; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    if (!start || !end) continue;

    result.push(start);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    const subdivisions = Math.max(1, Math.ceil(length / 8));
    const normalX = length === 0 ? 0 : -dy / length;
    const normalY = length === 0 ? 0 : dx / length;

    for (let step = 1; step < subdivisions; step += 1) {
      const t = step / subdivisions;
      const jitter = (random() * 2 - 1) * amplitude;
      result.push({
        x: start.x + dx * t + normalX * jitter,
        y: start.y + dy * t + normalY * jitter,
      });
    }
  }

  if (!closed) {
    const last = points[points.length - 1];
    if (last) result.push(last);
  }

  return result;
}

function tracePoints(
  context: CanvasRenderingContext2D,
  points: readonly Point[],
  closed: boolean,
): void {
  const first = points[0];
  if (!first) return;

  context.beginPath();
  context.moveTo(first.x, first.y);
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    if (point) context.lineTo(point.x, point.y);
  }
  if (closed) context.closePath();
}

function applyStrokeAppearance(
  context: CanvasRenderingContext2D,
  element: Element,
): void {
  const width = element.strokeWidth ?? 1;
  const strokeStyle = element.strokeStyle ?? "solid";
  const rounded = element.edgeStyle === "rounded";

  context.strokeStyle = element.strokeColor ?? "#000000";
  context.lineWidth = width;
  context.lineJoin = rounded ? "round" : "miter";
  context.lineCap = rounded || strokeStyle === "dotted" ? "round" : "butt";
  context.setLineDash(
    strokeStyle === "dashed"
      ? [width * 4, width * 2.5]
      : strokeStyle === "dotted"
        ? [Math.max(0.1, width * 0.1), width * 2.2]
        : [],
  );
}

function fillShape(
  context: CanvasRenderingContext2D,
  element: Element,
  bounds: LocalBounds,
  createPath: () => void,
): void {
  const backgroundColor = element.backgroundColor ?? "transparent";
  if (backgroundColor === "transparent") return;

  // Keep backgrounds visible for existing elements created before fill styles were rendered.
  const fillStyle =
    element.fillStyle === "none" && backgroundColor !== "transparent"
      ? "solid"
      : (element.fillStyle ?? "none");
  if (fillStyle === "none") return;

  context.save();
  createPath();

  if (fillStyle === "solid") {
    context.fillStyle = backgroundColor;
    context.fill();
    context.restore();
    return;
  }

  context.clip();
  context.strokeStyle = backgroundColor;
  context.lineWidth = Math.max(0.75, (element.strokeWidth ?? 1) * 0.65);
  context.lineCap = "butt";
  context.setLineDash([]);
  const spacing = 9;
  const firstOffset = bounds.x - bounds.height;
  const lastOffset = bounds.x + bounds.width;

  for (let offset = firstOffset; offset <= lastOffset; offset += spacing) {
    context.beginPath();
    context.moveTo(offset, bounds.y);
    context.lineTo(offset + bounds.height, bounds.y + bounds.height);
    context.stroke();

    if (fillStyle === "cross-hatch") {
      context.beginPath();
      context.moveTo(offset, bounds.y + bounds.height);
      context.lineTo(offset + bounds.height, bounds.y);
      context.stroke();
    }
  }

  context.restore();
}

function strokePoints(
  context: CanvasRenderingContext2D,
  element: Element,
  points: readonly Point[],
  closed = false,
): void {
  const styledPoints = getRoughPathPoints(points, closed, element);
  applyStrokeAppearance(context, element);
  tracePoints(context, styledPoints, closed);
  context.stroke();
}

function drawRectangle(
  context: CanvasRenderingContext2D,
  element: Extract<Element, { type: "rectangle" }>,
): void {
  const width = element.width ?? 0;
  const height = element.height ?? 0;
  const opacity = element.opacity ?? 100;
  context.save();
  applyElementTransform(context, element);
  context.globalAlpha = opacity / 100;

  const vertices = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  const radius =
    element.edgeStyle === "rounded"
      ? Math.min(12, Math.min(width, height) * 0.2)
      : 0;
  const outline = getRoundedPolygonPoints(vertices, radius);
  const createPath = () => tracePoints(context, outline, true);

  fillShape(context, element, { x: 0, y: 0, width, height }, createPath);
  strokePoints(context, element, outline, true);
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
  context.save();
  context.translate(x + width / 2, y + height / 2);
  context.rotate(angle);
  context.globalAlpha = opacity / 100;

  const halfWidth = Math.abs(width) / 2;
  const halfHeight = Math.abs(height) / 2;
  const createPath = () => {
    context.beginPath();
    context.ellipse(0, 0, halfWidth, halfHeight, 0, 0, Math.PI * 2);
  };
  const points = Array.from({ length: 64 }, (_, index) => {
    const angle = (index / 64) * Math.PI * 2;
    return { x: Math.cos(angle) * halfWidth, y: Math.sin(angle) * halfHeight };
  });

  fillShape(
    context,
    element,
    {
      x: -halfWidth,
      y: -halfHeight,
      width: halfWidth * 2,
      height: halfHeight * 2,
    },
    createPath,
  );
  strokePoints(context, element, points, true);
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
  context.save();
  context.translate(x + width / 2, y + height / 2);
  context.rotate(angle);
  context.globalAlpha = opacity / 100;

  const halfWidth = Math.abs(width) / 2;
  const halfHeight = Math.abs(height) / 2;

  const vertices = [
    { x: 0, y: -halfHeight },
    { x: halfWidth, y: 0 },
    { x: 0, y: halfHeight },
    { x: -halfWidth, y: 0 },
  ];
  const radius =
    element.edgeStyle === "rounded"
      ? Math.min(12, Math.min(halfWidth, halfHeight) * 0.35)
      : 0;
  const outline = getRoundedPolygonPoints(vertices, radius);
  const createPath = () => tracePoints(context, outline, true);

  fillShape(
    context,
    element,
    {
      x: -halfWidth,
      y: -halfHeight,
      width: halfWidth * 2,
      height: halfHeight * 2,
    },
    createPath,
  );
  strokePoints(context, element, outline, true);
  context.restore();
}

function drawLine(
  context: CanvasRenderingContext2D,
  element: Extract<Element, { type: "line" }>,
): void {
  const opacity = element.opacity ?? 100;
  const points = element.points ?? [];

  if (points.length < 2) {
    return;
  }

  context.save();
  applyElementTransform(context, element);
  context.globalAlpha = opacity / 100;
  strokePoints(context, element, points);
  context.restore();
}

export function drawArrow(
  context: CanvasRenderingContext2D,
  element: ArrowElement,
  label?: Extract<Element, { type: "text" }>,
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

  const opacity = element.opacity ?? 100;
  const strokeWidth = element.strokeWidth ?? 1;

  context.save();
  applyElementTransform(context, element);
  context.globalAlpha = opacity / 100;

  // Leave a small label-sized opening in the shaft so the arrow does not run
  // through its text. Measure the opening along the path at its midpoint.
  if (label && label.text.length > 0) {
    const pathLength = getPolylineLength(points);
    const midpointDistance = pathLength / 2;
    const before = getPolylinePointAt(
      points,
      Math.max(0, midpointDistance - 1),
    );
    const after = getPolylinePointAt(
      points,
      Math.min(pathLength, midpointDistance + 1),
    );
    const direction =
      Math.atan2(after.y - before.y, after.x - before.x) + (element.angle ?? 0);
    const labelWidth = label.width ?? 0;
    const labelHeight = label.height ?? 0;
    const projectedLabelWidth =
      Math.abs(Math.cos(direction)) * labelWidth +
      Math.abs(Math.sin(direction)) * labelHeight;
    const halfGap = projectedLabelWidth / 2 + 6;
    const gapStart = Math.max(0, midpointDistance - halfGap);
    const gapEnd = Math.min(pathLength, midpointDistance + halfGap);
    const beforeLabel = extractPolylineRange(points, 0, gapStart);
    const afterLabel = extractPolylineRange(points, gapEnd, pathLength);

    if (beforeLabel.length > 1) strokePoints(context, element, beforeLabel);
    if (afterLabel.length > 1) strokePoints(context, element, afterLabel);
  } else {
    strokePoints(context, element, points);
  }

  // Arrowhead
  const arrowHead = getArrowHeadPoints(
    previous,
    end,
    Math.max(10, strokeWidth * 4),
  );

  if (arrowHead) {
    strokePoints(context, element, [end, arrowHead.left]);
    strokePoints(context, element, [end, arrowHead.right]);
  }

  context.restore();
}

function getPolylineLength(points: readonly Point[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    length += Math.hypot(current.x - previous.x, current.y - previous.y);
  }
  return length;
}

function getPolylinePointAt(points: readonly Point[], distance: number): Point {
  let travelled = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]!;
    const end = points[index]!;
    const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
    if (distance <= travelled + segmentLength || index === points.length - 1) {
      const ratio =
        segmentLength === 0
          ? 0
          : Math.max(0, Math.min(1, (distance - travelled) / segmentLength));
      return {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
      };
    }
    travelled += segmentLength;
  }
  return points[0] ?? { x: 0, y: 0 };
}

function extractPolylineRange(
  points: readonly Point[],
  fromDistance: number,
  toDistance: number,
): Point[] {
  if (toDistance <= fromDistance) return [];
  const result: Point[] = [];
  let travelled = 0;

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]!;
    const end = points[index]!;
    const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
    const overlapStart = Math.max(fromDistance, travelled);
    const overlapEnd = Math.min(toDistance, travelled + segmentLength);
    if (overlapEnd > overlapStart && segmentLength > 0) {
      const startRatio = (overlapStart - travelled) / segmentLength;
      const endRatio = (overlapEnd - travelled) / segmentLength;
      const first = {
        x: start.x + (end.x - start.x) * startRatio,
        y: start.y + (end.y - start.y) * startRatio,
      };
      const last = {
        x: start.x + (end.x - start.x) * endRatio,
        y: start.y + (end.y - start.y) * endRatio,
      };
      if (result.length === 0) result.push(first);
      else {
        const previous = result[result.length - 1]!;
        if (Math.hypot(previous.x - first.x, previous.y - first.y) > 1e-6) {
          result.push(first);
        }
      }
      result.push(last);
    }
    travelled += segmentLength;
  }

  return result;
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

  const opacity = element.opacity ?? 100;

  context.save();
  applyElementTransform(context, element);
  context.globalAlpha = opacity / 100;
  strokePoints(context, element, points);
  context.restore();
}

function drawFreedraw(
  context: CanvasRenderingContext2D,
  element: FreedrawElement,
): void {
  if (element.points.length < 2) {
    return;
  }

  const path = buildClosedStrokePath(element.points, element.strokeWidth ?? 1);

  if (path.length < 3) {
    return;
  }

  const firstPoint = path[0];

  if (!firstPoint) {
    return;
  }

  const opacity = element.opacity ?? 100;
  const strokeColor = element.strokeColor ?? "#000000";

  context.save();
  applyElementTransform(context, element);
  context.globalAlpha = opacity / 100;
  context.fillStyle = strokeColor;
  const roughPath = getRoughPathPoints(path, true, element);
  tracePoints(context, roughPath, true);
  context.fill();
  strokePoints(context, element, path, true);
  context.restore();
}

function drawText(
  context: CanvasRenderingContext2D,
  element: Extract<Element, { type: "text" }>,
): void {
  context.save();
  applyElementTransform(context, element);
  context.globalAlpha = (element.opacity ?? 100) / 100;
  context.fillStyle = element.strokeColor ?? "#1e1e1e";
  const fontSize = element.fontSize || DEFAULT_TEXT_FONT_SIZE;
  const fontFamily = element.fontFamily || DEFAULT_TEXT_FONT_FAMILY;
  const textAlign = element.textAlign ?? "left";
  context.font = `${fontSize}px ${fontFamily}`;
  context.textAlign = textAlign;
  context.textBaseline = "top";
  const x =
    textAlign === "center"
      ? (element.width ?? 0) / 2
      : textAlign === "right"
        ? (element.width ?? 0)
        : 0;
  const { lineHeight, lines } = measureText(
    element.text,
    fontSize,
    fontFamily,
    element.containerId || element.wrapText
      ? (element.width ?? 0)
      : undefined,
  );
  const layoutHeight = lines.length * lineHeight;
  const y =
    element.verticalAlign === "middle"
      ? ((element.height ?? layoutHeight) - layoutHeight) / 2
      : element.verticalAlign === "bottom"
        ? (element.height ?? layoutHeight) - layoutHeight
        : 0;
  lines.forEach((line, index) =>
    context.fillText(line, x, y + index * lineHeight),
  );
  context.restore();
}

function drawElement(
  context: CanvasRenderingContext2D,
  element: Element,
  elements: readonly Element[] = [element],
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
      drawArrow(
        context,
        element,
        elements.find(
          (candidate): candidate is Extract<Element, { type: "text" }> =>
            candidate.type === "text" &&
            candidate.containerId === element.id &&
            !candidate.isDeleted,
        ),
      );
      break;

    case "freedraw":
      drawFreedraw(context, element);
      break;

    case "text":
      drawText(context, element);
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
  options: StaticRenderOptions = {},
): number {
  const { context, width, height, viewport } = renderContext;
  clearCanvas(context, width, height);
  if (options.background !== false) drawBackground(context, width, height);
  if (options.grid !== false) drawGrid(context, width, height, viewport);
  if (options.origin !== false) drawOrigin(context, viewport);

  const viewportBounds = viewportToSceneBounds({ width, height }, viewport);
  const visibleElements = getVisibleElements(elements, viewportBounds);
  context.save();

  applyViewportTransform(context, viewport);

  for (const element of visibleElements) {
    drawElement(context, element, elements);
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
