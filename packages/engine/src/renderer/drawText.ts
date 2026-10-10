import type { Element, FreedrawElement } from "@repo/common";
import { buildClosedStrokePath } from "../geometry/strokeOutline";
import {
  DEFAULT_TEXT_FONT_FAMILY,
  DEFAULT_TEXT_FONT_SIZE,
  measureText,
} from "../text";
import { applyElementTransform } from "./drawTransform";
import { strokePoints, tracePoints } from "./drawPaths";
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
