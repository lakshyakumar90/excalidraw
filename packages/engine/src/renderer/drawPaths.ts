import type { Element, Point } from "@repo/common";
import { getSketchGeometry, getSketchLinePaths } from "./sketch/geometry";
import { getRoughPathPoints } from "./sketch/roughPath";
import { traceSketchPath } from "./sketch/canvasPath";
import { applyElementTransform } from "./drawTransform";

export { getRoughPathPoints } from "./sketch/roughPath";

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

/**
 * Catmull-Rom smoothing that passes exactly through every point. Used for
 * freehand strokes and other sampled paths so they render as smooth curves
 * rather than connecting sharp line segments.
 */
export function traceSmoothPoints(
  context: CanvasRenderingContext2D,
  points: readonly Point[],
  closed = false,
): void {
  const first = points[0];
  if (!first) return;
  if (points.length < 3) {
    tracePoints(context, points, closed);
    return;
  }

  const count = points.length;
  const segments = closed ? count : count - 1;
  context.beginPath();
  context.moveTo(first.x, first.y);

  for (let index = 0; index < segments; index += 1) {
    const p1 = points[index]!;
    const p2 = points[(index + 1) % count]!;
    const p0 = closed
      ? points[(index - 1 + count) % count]!
      : points[Math.max(0, index - 1)]!;
    const p3 = closed
      ? points[(index + 2) % count]!
      : points[Math.min(count - 1, index + 2)]!;
    context.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6,
      p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6,
      p2.y - (p3.y - p1.y) / 6,
      p2.x,
      p2.y,
    );
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
    traceSmoothPoints(context, getRoughPathPoints(points, true, element), true);
    context.lineJoin = "round";
    context.lineCap = "round";
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
