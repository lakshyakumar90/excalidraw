import type { Element, Point } from "@repo/common";
import { getBoundsCenter } from "../geometry/bounds";
import { getArrowHeadPoints } from "../geometry/arrow";
import { sampleCatmullRom } from "../geometry/curve";
import { getElementAxisAlignedBounds } from "../geometry/elementBounds";
import { getElementLocalBounds } from "../geometry/elementLocalBounds";
import { buildClosedStrokePath } from "../geometry/strokeOutline";
import { measureText } from "../text/measureText";
import { getSketchGeometry, getSketchLinePaths } from "./sketch/geometry";
import { sketchPathToSvg } from "./sketch/canvasPath";
import { sketchSettings } from "./sketch/settings";

export interface SvgRenderOptions {
  padding?: number;
  background?: string | null;
  imageFiles?: ReadonlyMap<string, string>;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function pathFromPoints(points: readonly Point[], closed = false): string {
  const first = points[0];
  if (!first) return "";
  const parts = [`M ${first.x} ${first.y}`];
  for (const point of points.slice(1)) parts.push(`L ${point.x} ${point.y}`);
  if (closed) parts.push("Z");
  return parts.join(" ");
}

function styleAttributes(element: Element): string {
  const strokeWidth = element.strokeWidth ?? 1;
  const dash =
    element.strokeStyle === "dashed"
      ? `${strokeWidth * 4} ${strokeWidth * 2.5}`
      : element.strokeStyle === "dotted"
        ? `${Math.max(0.1, strokeWidth * 0.1)} ${strokeWidth * 2.2}`
        : "";
  return [
    `stroke="${escapeXml(element.strokeColor ?? "#000000")}"`,
    `stroke-width="${strokeWidth}"`,
    `stroke-linecap="${element.edgeStyle === "rounded" || element.strokeStyle === "dotted" ? "round" : "butt"}"`,
    `stroke-linejoin="${element.edgeStyle === "rounded" ? "round" : "miter"}"`,
    dash ? `stroke-dasharray="${dash}"` : "",
    `opacity="${(element.opacity ?? 100) / 100}"`,
  ]
    .filter(Boolean)
    .join(" ");
}

function renderSketchShape(element: Element): string {
  const geometry = getSketchGeometry(element);
  const fillStyle =
    element.fillStyle === "none" &&
    element.backgroundColor &&
    element.backgroundColor !== "transparent"
      ? "solid"
      : (element.fillStyle ?? "none");
  const fillColor = escapeXml(element.backgroundColor ?? "transparent");
  const fillParts: string[] = [];
  if (fillColor !== "transparent" && fillStyle === "solid") {
    fillParts.push(
      `<path d="${sketchPathToSvg(geometry.fillContour)}" fill="${fillColor}" stroke="none"/>`,
    );
  } else if (
    fillColor !== "transparent" &&
    (fillStyle === "hachure" || fillStyle === "cross-hatch")
  ) {
    for (const direction of geometry.hatch) {
      const path = direction
        .map(({ start, end }) => `M ${start.x} ${start.y} L ${end.x} ${end.y}`)
        .join(" ");
      if (path)
        fillParts.push(
          `<path d="${path}" fill="none" stroke="${fillColor}" stroke-width="${Math.max(0.75, (element.strokeWidth ?? 1) * 0.65)}"/>`,
        );
    }
  }
  const outlines = geometry.outlines
    .map((commands) => `<path d="${sketchPathToSvg(commands)}" fill="none"/>`)
    .join("");
  return `${fillParts.join("")}${outlines}`;
}

function elementTransform(element: Element): string {
  const bounds = getElementLocalBounds(element);
  const center = getBoundsCenter(bounds);
  const rotation = ((element.angle ?? 0) * 180) / Math.PI;
  return `translate(${element.x + center.x} ${element.y + center.y}) rotate(${rotation}) translate(${-center.x} ${-center.y})`;
}

function renderElement(
  element: Element,
  imageFiles: ReadonlyMap<string, string>,
): string {
  const attrs = styleAttributes(element);
  const groupStart = `<g data-element-id="${escapeXml(element.id)}" transform="${elementTransform(element)}" ${attrs}>`;
  switch (element.type) {
    case "rectangle": {
      return `${groupStart}${renderSketchShape(element)}</g>`;
    }
    case "ellipse": {
      return `${groupStart}${renderSketchShape(element)}</g>`;
    }
    case "diamond": {
      return `${groupStart}${renderSketchShape(element)}</g>`;
    }
    case "line": {
      const points =
        element.lineType === "curved"
          ? sampleCatmullRom(element.points, 12)
          : element.points;
      const paths = getSketchLinePaths(points, element)
        .map(
          (commands) => `<path d="${sketchPathToSvg(commands)}" fill="none"/>`,
        )
        .join("");
      return `${groupStart}${paths}</g>`;
    }
    case "arrow": {
      const points =
        element.lineType === "curved"
          ? sampleCatmullRom(element.points, 12)
          : element.points;
      const start = points[0];
      const end = points.at(-1);
      const previous = points.at(-2);
      if (!start || !end || !previous) return "";
      const arrowHead = getArrowHeadPoints(
        previous,
        end,
        Math.max(10, (element.strokeWidth ?? 1) * 4),
      );
      const paths = getSketchLinePaths(points, element).map(
        (commands) => `<path d="${sketchPathToSvg(commands)}" fill="none"/>`,
      );
      if (arrowHead) {
        paths.push(
          ...getSketchLinePaths([end, arrowHead.left], element, 1).map(
            (commands) =>
              `<path d="${sketchPathToSvg(commands)}" fill="none"/>`,
          ),
        );
        paths.push(
          ...getSketchLinePaths([end, arrowHead.right], element, 2).map(
            (commands) =>
              `<path d="${sketchPathToSvg(commands)}" fill="none"/>`,
          ),
        );
      }
      return `${groupStart}${paths.join("")}</g>`;
    }
    case "freedraw": {
      const path = buildClosedStrokePath(
        element.points,
        element.strokeWidth ?? 1,
      );
      if (path.length < 3) return "";
      return `${groupStart}<path d="${pathFromPoints(path, true)}" fill="${escapeXml(element.strokeColor ?? "#000000")}"/></g>`;
    }
    case "text": {
      const fontSize = element.fontSize;
      const layout = measureText(
        element.text,
        fontSize,
        element.fontFamily,
        element.containerId || element.wrapText
          ? (element.width ?? 0)
          : undefined,
      );
      const x =
        element.textAlign === "center"
          ? (element.width ?? 0) / 2
          : element.textAlign === "right"
            ? (element.width ?? 0)
            : 0;
      const y =
        element.verticalAlign === "middle"
          ? ((element.height ?? layout.height) - layout.height) / 2
          : element.verticalAlign === "bottom"
            ? (element.height ?? layout.height) - layout.height
            : 0;
      const tspans = layout.lines
        .map(
          (line, index) =>
            `<tspan x="${x}" y="${y + index * layout.lineHeight}">${escapeXml(line)}</tspan>`,
        )
        .join("");
      const anchor =
        element.textAlign === "center"
          ? "middle"
          : element.textAlign === "right"
            ? "end"
            : "start";
      return `<g transform="${elementTransform(element)}" opacity="${(element.opacity ?? 100) / 100}"><text fill="${escapeXml(element.strokeColor ?? "#1e1e1e")}" font-family="${escapeXml(element.fontFamily)}" font-size="${fontSize}" text-anchor="${anchor}">${tspans}</text></g>`;
    }
    case "image": {
      const href = imageFiles.get(element.fileId);
      if (!href) return "";
      return `<g transform="${elementTransform(element)}" opacity="${(element.opacity ?? 100) / 100}"><image x="0" y="0" width="${element.width ?? 0}" height="${element.height ?? 0}" preserveAspectRatio="none" href="${escapeXml(href)}"/></g>`;
    }
    default:
      return "";
  }
}

export function renderSceneToSvg(
  inputElements: readonly Element[],
  options: SvgRenderOptions = {},
): string {
  const elements = inputElements.filter((element) => !element.isDeleted);
  if (elements.length === 0) throw new Error("There is nothing to export yet");
  const bounds = elements.map(getElementAxisAlignedBounds);
  const minX = Math.min(
    ...bounds.map((item, index) => item.minX - paintPadding(elements[index]!)),
  );
  const minY = Math.min(
    ...bounds.map((item, index) => item.minY - paintPadding(elements[index]!)),
  );
  const maxX = Math.max(
    ...bounds.map((item, index) => item.maxX + paintPadding(elements[index]!)),
  );
  const maxY = Math.max(
    ...bounds.map((item, index) => item.maxY + paintPadding(elements[index]!)),
  );
  const padding = Math.max(0, options.padding ?? 24);
  const width = Math.ceil(maxX - minX + padding * 2);
  const height = Math.ceil(maxY - minY + padding * 2);
  const defs: string[] = [];
  const imageFiles = options.imageFiles ?? new Map<string, string>();
  const rendered = elements
    .map((element) => renderElement(element, imageFiles))
    .join("");
  const background = options.background
    ? `<rect width="100%" height="100%" fill="${escapeXml(options.background)}"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${background}<g transform="translate(${padding - minX} ${padding - minY})">${rendered}</g></svg>`;
}

function paintPadding(element: Element): number {
  const settings = sketchSettings(element.roughness);
  const arrowExtra =
    element.type === "arrow" ? Math.max(10, (element.strokeWidth ?? 1) * 4) : 0;
  return (
    settings.amplitude +
    settings.overshoot +
    (element.strokeWidth ?? 1) / 2 +
    arrowExtra
  );
}
