import type { ArrowElement, Element, LineElement, Point } from "@repo/common";
import { getArrowHeadPoints, sampleCatmullRom } from "../geometry";
import { applyElementTransform } from "./drawTransform";
import { strokePoints } from "./drawPaths";
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
