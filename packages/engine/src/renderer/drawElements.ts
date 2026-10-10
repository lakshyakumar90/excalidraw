import type { Element } from "@repo/common";
import { drawArrow, drawCurvedLine, drawLine } from "./drawConnectors";
import { applyElementTransform } from "./drawTransform";
import { drawDiamond, drawEllipse, drawRectangle } from "./drawPaths";
import { drawFreedraw, drawText } from "./drawText";

export {
  drawArrow,
  drawCurvedLine,
  drawLine,
  extractPolylineRange,
  getPolylineLength,
  getPolylinePointAt,
} from "./drawConnectors";
export {
  applyStrokeAppearance,
  drawDiamond,
  drawEllipse,
  drawRectangle,
  drawSketchShape,
  getRoughPathPoints,
  strokePoints,
  tracePoints,
} from "./drawPaths";
export { applyElementTransform } from "./drawTransform";
export { drawFreedraw, drawText } from "./drawText";

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
      if (element.lineType === "curved") drawCurvedLine(context, element);
      else drawLine(context, element);
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
