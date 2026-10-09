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
import { getSketchGeometry, getSketchLinePaths } from "./sketch/geometry";
import { traceSketchPath } from "./sketch/canvasPath";
import {
  type ElementBitmap,
  ElementBitmapCache,
  createBitmapCanvas,
  quantizeZoom,
} from "./elementBitmapCache";
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
  bitmapCache?: ElementBitmapCache;
  pixelRatio?: number;
  bypassBitmapCache?: boolean;
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

function strokePoints(
  context: CanvasRenderingContext2D,
  element: Element,
  points: readonly Point[],
  closed = false,
  stream = 0,
): void {
  applyStrokeAppearance(context, element);
  if (closed) {
    tracePoints(context, getRoughPathPoints(points, true, element), true);
    context.stroke();
    return;
  }
  for (const path of getSketchLinePaths(points, element, stream)) {
    traceSketchPath(context, path);
    context.stroke();
  }
}

function drawSketchShape(
  context: CanvasRenderingContext2D,
  element: Element,
): void {
  const geometry = getSketchGeometry(element);
  context.save();
  applyElementTransform(context, element);
  context.globalAlpha = (element.opacity ?? 100) / 100;
  const background = element.backgroundColor ?? "transparent";
  const fillStyle =
    element.fillStyle === "none" && background !== "transparent"
      ? "solid"
      : (element.fillStyle ?? "none");

  if (background !== "transparent" && fillStyle !== "none") {
    if (fillStyle === "solid") {
      context.fillStyle = background;
      traceSketchPath(context, geometry.fillContour);
      context.fill();
    } else {
      context.save();
      traceSketchPath(context, geometry.fillContour);
      context.clip();
      context.strokeStyle = background;
      context.lineWidth = Math.max(0.75, (element.strokeWidth ?? 1) * 0.65);
      context.lineCap = "butt";
      context.setLineDash([]);
      for (const direction of geometry.hatch) {
        for (const segment of direction) {
          context.beginPath();
          context.moveTo(segment.start.x, segment.start.y);
          context.lineTo(segment.end.x, segment.end.y);
          context.stroke();
        }
      }
      context.restore();
    }
  }

  applyStrokeAppearance(context, element);
  for (const outline of geometry.outlines) {
    traceSketchPath(context, outline);
    context.stroke();
  }
  context.restore();
}

function drawRectangle(
  context: CanvasRenderingContext2D,
  element: Extract<Element, { type: "rectangle" }>,
): void {
  drawSketchShape(context, element);
}

function drawEllipse(
  context: CanvasRenderingContext2D,
  element: Extract<Element, { type: "ellipse" }>,
): void {
  drawSketchShape(context, element);
}

function drawDiamond(
  context: CanvasRenderingContext2D,
  element: Extract<Element, { type: "diamond" }>,
): void {
  drawSketchShape(context, element);
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

  const pathPoints =
    element.lineType === "curved" ? sampleCatmullRom(points, 12) : points;
  const start = pathPoints[0];
  const end = pathPoints[pathPoints.length - 1];
  const previous = pathPoints[pathPoints.length - 2];

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
    const pathLength = getPolylineLength(pathPoints);
    const midpointDistance = pathLength / 2;
    const before = getPolylinePointAt(
      pathPoints,
      Math.max(0, midpointDistance - 1),
    );
    const after = getPolylinePointAt(
      pathPoints,
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
    const beforeLabel = extractPolylineRange(pathPoints, 0, gapStart);
    const afterLabel = extractPolylineRange(pathPoints, gapEnd, pathLength);

    if (beforeLabel.length > 1) strokePoints(context, element, beforeLabel);
    if (afterLabel.length > 1) strokePoints(context, element, afterLabel);
  } else {
    strokePoints(context, element, pathPoints);
  }

  // Arrowhead
  const arrowHead = getArrowHeadPoints(
    previous,
    end,
    Math.max(10, strokeWidth * 4),
  );

  if (arrowHead) {
    strokePoints(context, element, [end, arrowHead.left], false, 1);
    strokePoints(context, element, [end, arrowHead.right], false, 2);
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
  tracePoints(context, path, true);
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
    element.containerId || element.wrapText ? (element.width ?? 0) : undefined,
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
  imageAssets: ReadonlyMap<string, CanvasImageSource> = new Map(),
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

    case "image": {
      context.save();
      applyElementTransform(context, element);
      context.globalAlpha = (element.opacity ?? 100) / 100;
      const asset = imageAssets.get(element.fileId);
      if (asset) {
        context.drawImage(asset, 0, 0, element.width ?? 0, element.height ?? 0);
      } else {
        context.fillStyle = "#f1f3f5";
        context.strokeStyle = "#adb5bd";
        context.fillRect(0, 0, element.width ?? 0, element.height ?? 0);
        context.strokeRect(0, 0, element.width ?? 0, element.height ?? 0);
      }
      context.restore();
      break;
    }

    default:
      break;
  }
}

function cachedShapeKey(
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

function drawCachedShape(
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
  const visibleElements = getVisibleElements(elements, viewportBounds);
  context.save();

  applyViewportTransform(context, viewport);

  for (const element of visibleElements) {
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
