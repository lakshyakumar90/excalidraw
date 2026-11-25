import type { StickyElement } from "@repo/common";
import {
  STICKY_FOLD_COLOR,
  STICKY_PAPER_COLOR,
  STICKY_TEXT_COLOR,
  STICKY_TEXT_PADDING,
} from "../element/sticky";
import { measureText } from "../text";
import { applyElementTransform } from "./drawTransform";
import { deriveSeed, mulberry32 } from "./sketch/prng";
import { sketchSettings } from "./sketch/settings";

/** Draws a resizable sticky note with a folded corner and wrapped text. */
export function drawSticky(
  context: CanvasRenderingContext2D,
  element: StickyElement,
): void {
  const width = Math.max(1, element.width ?? 0);
  const height = Math.max(1, element.height ?? 0);
  const fold = Math.min(26, width / 4, height / 4);

  const random = mulberry32(deriveSeed(element.seed, 0x53544943));
  const jitter = sketchSettings(element.roughness).amplitude;
  const offset = () => (jitter ? (random() * 2 - 1) * jitter * 0.8 : 0);
  const corners = [
    { x: offset(), y: offset() },
    { x: width + offset(), y: offset() },
    { x: width + offset(), y: height - fold + offset() },
    { x: width - fold + offset(), y: height + offset() },
    { x: offset(), y: height + offset() },
  ];

  context.save();
  applyElementTransform(context, element);
  context.globalAlpha = (element.opacity ?? 100) / 100;

  const tracePaper = () => {
    const first = corners[0]!;
    context.beginPath();
    context.moveTo(first.x, first.y);
    for (let index = 1; index < corners.length; index += 1) {
      const point = corners[index]!;
      context.lineTo(point.x, point.y);
    }
    context.closePath();
  };

  tracePaper();
  context.shadowColor = "rgba(0, 0, 0, 0.4)";
  context.shadowBlur = 14;
  context.shadowOffsetY = 6;
  const paper = context.createLinearGradient(0, 0, width, height);
  paper.addColorStop(0, "#FFE99A");
  paper.addColorStop(0.55, STICKY_PAPER_COLOR);
  paper.addColorStop(1, "#F0CB52");
  context.fillStyle = paper;
  context.fill();
  context.shadowColor = "transparent";
  context.shadowBlur = 0;
  context.shadowOffsetY = 0;

  context.strokeStyle = "rgba(90, 70, 0, 0.22)";
  context.lineWidth = 1;
  context.lineJoin = "round";
  context.stroke();

  // Soft top edge highlight makes the note read as paper rather than a flat rect.
  const topLeft = corners[0]!;
  const topRight = corners[1]!;
  context.beginPath();
  context.moveTo(topLeft.x, topLeft.y + 1.5);
  context.lineTo(topRight.x, topRight.y + 1.5);
  context.strokeStyle = "rgba(255, 255, 255, 0.35)";
  context.stroke();

  if (fold > 0) {
    const right = corners[2]!;
    const folded = corners[3]!;
    context.beginPath();
    context.moveTo(right.x, right.y);
    context.lineTo(width, height);
    context.lineTo(folded.x, folded.y);
    context.closePath();
    context.fillStyle = STICKY_FOLD_COLOR;
    context.fill();
    context.strokeStyle = "rgba(90, 70, 0, 0.18)";
    context.stroke();
    context.beginPath();
    context.moveTo(right.x, right.y);
    context.lineTo(folded.x, folded.y);
    context.strokeStyle = "rgba(255, 255, 255, 0.45)";
    context.stroke();
  }

  const padding = Math.min(STICKY_TEXT_PADDING, width / 6, height / 6);
  const innerWidth = Math.max(1, width - padding * 2);
  const innerHeight = Math.max(1, height - padding * 2);
  const isEmpty = element.text.trim().length === 0;
  const layout = measureText(
    isEmpty ? "Type here…" : element.text,
    element.fontSize,
    element.fontFamily,
    innerWidth,
  );
  const textX =
    element.textAlign === "center"
      ? padding + innerWidth / 2
      : element.textAlign === "right"
        ? padding + innerWidth
        : padding;
  const textY =
    element.verticalAlign === "middle"
      ? padding + Math.max(0, (innerHeight - layout.height) / 2)
      : element.verticalAlign === "bottom"
        ? padding + Math.max(0, innerHeight - layout.height)
        : padding;

  context.save();
  context.beginPath();
  context.rect(padding, padding, innerWidth, innerHeight);
  context.clip();
  context.fillStyle = STICKY_TEXT_COLOR;
  context.globalAlpha *= isEmpty ? 0.45 : 1;
  context.font = `${element.fontSize}px ${element.fontFamily}`;
  context.textAlign = element.textAlign;
  context.textBaseline = "top";
  layout.lines.forEach((line, index) => {
    context.fillText(line, textX, textY + index * layout.lineHeight);
  });
  context.restore();
  context.restore();
}
