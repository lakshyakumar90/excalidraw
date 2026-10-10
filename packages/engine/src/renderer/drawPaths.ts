import type { Element, Point } from "@repo/common";
import { getSketchGeometry, getSketchLinePaths } from "./sketch/geometry";
import { traceSketchPath } from "./sketch/canvasPath";
import { applyElementTransform } from "./drawTransform";

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
