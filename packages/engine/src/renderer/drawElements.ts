import type {
  ArrowElement,
  Element,
  FreedrawElement,
  LineElement,
  Point,
} from "@repo/common";

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
  DEFAULT_TEXT_FONT_FAMILY,
  DEFAULT_TEXT_FONT_SIZE,
  measureText,
} from "../text";

export function applyElementTransform(
  context: CanvasRenderingContext2D,
  element: Element,
): void {
  const localBounds = getElementLocalBounds(element);
  const center = getBoundsCenter(localBounds);

  context.translate(element.x + center.x, element.y + center.y);
  context.rotate(element.angle ?? 0);
  context.translate(-center.x, -center.y);
}

export function getRoughPathPoints(
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

export function tracePoints(
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

export function applyStrokeAppearance(
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

export function strokePoints(
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

export function drawSketchShape(
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

export function drawRectangle(
  context: CanvasRenderingContext2D,
  element: Extract<Element, { type: "rectangle" }>,
): void {
  drawSketchShape(context, element);
}

export function drawEllipse(
  context: CanvasRenderingContext2D,
  element: Extract<Element, { type: "ellipse" }>,
): void {
  drawSketchShape(context, element);
}

export function drawDiamond(
  context: CanvasRenderingContext2D,
  element: Extract<Element, { type: "diamond" }>,
): void {
  drawSketchShape(context, element);
}

export function drawLine(
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

export function getPolylineLength(points: readonly Point[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    length += Math.hypot(current.x - previous.x, current.y - previous.y);
  }
  return length;
}

export function getPolylinePointAt(
  points: readonly Point[],
  distance: number,
): Point {
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

export function extractPolylineRange(
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

export function drawFreedraw(
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

export function drawText(
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

export function drawElement(
  context: CanvasRenderingContext2D,
  element: Element,
  elements: readonly Element[] = [element],
  imageAssets: ReadonlyMap<string, CanvasImageSource> = new Map(),
): void {
  switch (element.type) {
    case "frame":
      context.save();
      context.strokeStyle = "#868e96";
      context.lineWidth = 1;
      context.strokeRect(
        element.x,
        element.y,
        element.width ?? 0,
        element.height ?? 0,
      );
      context.fillStyle = "#495057";
      context.font = "14px sans-serif";
      context.fillText(element.name || "Frame", element.x, element.y - 6);
      context.restore();
      break;
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
