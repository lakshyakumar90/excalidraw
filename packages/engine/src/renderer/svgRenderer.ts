import type { Element, Point } from "@repo/common";
import { getBoundsCenter } from "../geometry/bounds";
import { getArrowHeadPoints } from "../geometry/arrow";
import { sampleCatmullRom } from "../geometry/curve";
import { getElementAxisAlignedBounds } from "../geometry/elementBounds";
import { getElementLocalBounds } from "../geometry/elementLocalBounds";
import { buildClosedStrokePath } from "../geometry/strokeOutline";
import { measureText } from "../text/measureText";

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

function roughen(
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
  const count = closed ? points.length : points.length - 1;
  for (let index = 0; index < count; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    if (!start || !end) continue;
    result.push(start);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    const subdivisions = Math.max(1, Math.ceil(length / 8));
    for (let step = 1; step < subdivisions; step += 1) {
      const t = step / subdivisions;
      const jitter = (random() * 2 - 1) * amplitude;
      result.push({
        x: start.x + dx * t - (length ? dy / length : 0) * jitter,
        y: start.y + dy * t + (length ? dx / length : 0) * jitter,
      });
    }
  }
  if (!closed) {
    const last = points.at(-1);
    if (last) result.push(last);
  }
  return result;
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

function shapeFill(element: Element, patternId: string): string {
  const color = element.backgroundColor ?? "transparent";
  const fillStyle = element.fillStyle === "none" && color !== "transparent"
    ? "solid"
    : (element.fillStyle ?? "none");
  if (color === "transparent" || fillStyle === "none") return "fill=\"none\"";
  if (fillStyle === "solid") return `fill="${escapeXml(color)}"`;
  return `fill="url(#${patternId})"`;
}

function elementTransform(element: Element): string {
  const bounds = getElementLocalBounds(element);
  const center = getBoundsCenter(bounds);
  const rotation = ((element.angle ?? 0) * 180) / Math.PI;
  return `translate(${element.x + center.x} ${element.y + center.y}) rotate(${rotation}) translate(${-center.x} ${-center.y})`;
}

function renderElement(
  element: Element,
  defs: string[],
  imageFiles: ReadonlyMap<string, string>,
): string {
  const id = `fill-${element.id.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}`;
  const fillStyle = element.fillStyle;
  if (
    fillStyle === "hachure" ||
    fillStyle === "cross-hatch" ||
    (fillStyle === "none" && element.backgroundColor && element.backgroundColor !== "transparent")
  ) {
    const color = escapeXml(element.backgroundColor ?? "transparent");
    defs.push(
      `<pattern id="${id}" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M -2 0 L 7 9 M 2 0 L 11 9" stroke="${color}" stroke-width="${Math.max(0.75, (element.strokeWidth ?? 1) * 0.65)}"/>${fillStyle === "cross-hatch" ? `<path d="M -2 9 L 7 0 M 2 9 L 11 0" stroke="${color}" stroke-width="${Math.max(0.75, (element.strokeWidth ?? 1) * 0.65)}"/>` : ""}</pattern>`,
    );
  }

  const attrs = styleAttributes(element);
  const groupStart = `<g transform="${elementTransform(element)}" ${attrs}>`;
  switch (element.type) {
    case "rectangle": {
      const width = element.width ?? 0;
      const height = element.height ?? 0;
      const radius = element.edgeStyle === "rounded" ? Math.min(12, Math.min(width, height) * 0.2) : 0;
      return `${groupStart}<rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ${shapeFill(element, id)}/></g>`;
    }
    case "ellipse": {
      const width = Math.abs(element.width ?? 0);
      const height = Math.abs(element.height ?? 0);
      return `${groupStart}<ellipse cx="${width / 2}" cy="${height / 2}" rx="${width / 2}" ry="${height / 2}" ${shapeFill(element, id)}/></g>`;
    }
    case "diamond": {
      const width = Math.abs(element.width ?? 0);
      const height = Math.abs(element.height ?? 0);
      const points = [
        { x: width / 2, y: 0 },
        { x: width, y: height / 2 },
        { x: width / 2, y: height },
        { x: 0, y: height / 2 },
      ];
      return `${groupStart}<path d="${pathFromPoints(roughen(points, true, element), true)}" ${shapeFill(element, id)}/></g>`;
    }
    case "line": {
      const points = element.lineType === "curved" ? sampleCatmullRom(element.points, 12) : element.points;
      return `${groupStart}<path d="${pathFromPoints(roughen(points, false, element))}" fill="none"/></g>`;
    }
    case "arrow": {
      const points = element.points;
      const start = points[0];
      const end = points.at(-1);
      const previous = points.at(-2);
      if (!start || !end || !previous) return "";
      const arrowHead = getArrowHeadPoints(previous, end, Math.max(10, (element.strokeWidth ?? 1) * 4));
      const paths = [`<path d="${pathFromPoints(roughen(points, false, element))}" fill="none"/>`];
      if (arrowHead) {
        paths.push(`<path d="${pathFromPoints([end, arrowHead.left])}" fill="none"/>`);
        paths.push(`<path d="${pathFromPoints([end, arrowHead.right])}" fill="none"/>`);
      }
      return `${groupStart}${paths.join("")}</g>`;
    }
    case "freedraw": {
      const path = buildClosedStrokePath(element.points, element.strokeWidth ?? 1);
      if (path.length < 3) return "";
      return `${groupStart}<path d="${pathFromPoints(roughen(path, true, element), true)}" fill="${escapeXml(element.strokeColor ?? "#000000")}"/></g>`;
    }
    case "text": {
      const fontSize = element.fontSize;
      const layout = measureText(
        element.text,
        fontSize,
        element.fontFamily,
        element.containerId || element.wrapText ? element.width ?? 0 : undefined,
      );
      const x = element.textAlign === "center" ? (element.width ?? 0) / 2 : element.textAlign === "right" ? element.width ?? 0 : 0;
      const y = element.verticalAlign === "middle"
        ? ((element.height ?? layout.height) - layout.height) / 2
        : element.verticalAlign === "bottom"
          ? (element.height ?? layout.height) - layout.height
          : 0;
      const tspans = layout.lines.map((line, index) => `<tspan x="${x}" y="${y + index * layout.lineHeight}">${escapeXml(line)}</tspan>`).join("");
      const anchor = element.textAlign === "center" ? "middle" : element.textAlign === "right" ? "end" : "start";
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
  const minX = Math.min(...bounds.map((item) => item.minX));
  const minY = Math.min(...bounds.map((item) => item.minY));
  const maxX = Math.max(...bounds.map((item) => item.maxX));
  const maxY = Math.max(...bounds.map((item) => item.maxY));
  const padding = Math.max(0, options.padding ?? 24);
  const width = Math.ceil(maxX - minX + padding * 2);
  const height = Math.ceil(maxY - minY + padding * 2);
  const defs: string[] = [];
  const imageFiles = options.imageFiles ?? new Map<string, string>();
  const rendered = elements
    .map((element) => renderElement(element, defs, imageFiles))
    .join("");
  const background = options.background
    ? `<rect width="100%" height="100%" fill="${escapeXml(options.background)}"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${defs.join("")}</defs>${background}<g transform="translate(${padding - minX} ${padding - minY})">${rendered}</g></svg>`;
}
