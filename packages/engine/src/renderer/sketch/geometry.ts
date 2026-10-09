import type { Element, Point } from "@repo/common";
import { deriveSeed, mulberry32 } from "./prng";
import { sketchSettings } from "./settings";

export type SketchCommand =
  | { type: "M" | "L"; x: number; y: number }
  | { type: "Q"; cx: number; cy: number; x: number; y: number }
  | {
      type: "C";
      c1x: number;
      c1y: number;
      c2x: number;
      c2y: number;
      x: number;
      y: number;
    }
  | { type: "Z" };

export interface SketchSegment {
  start: Point;
  end: Point;
}

export interface SketchGeometry {
  /** Open, deliberately overlapping cubic strokes. */
  outlines: SketchCommand[][];
  /** Closed contour used for solid fill and clipping. */
  fillContour: SketchCommand[];
  /** Boundary polygon shared by deterministic scanline fill. */
  boundary: Point[];
  hatch: SketchSegment[][];
}

const GEOMETRY_CACHE_LIMIT = 2048;
const geometryCache = new Map<string, SketchGeometry>();

const point = (x: number, y: number): Point => ({ x, y });
const finite = (value: number) => (Number.isFinite(value) ? value : 0);

function geometryKey(element: Element): string {
  const vector =
    element.type === "line" || element.type === "arrow"
      ? element.points
      : undefined;
  return JSON.stringify([
    element.id,
    element.version,
    element.versionNonce,
    element.type,
    element.width,
    element.height,
    vector,
    element.type === "line" || element.type === "arrow"
      ? element.lineType
      : undefined,
    element.seed,
    element.roughness,
    element.edgeStyle,
    element.fillStyle,
    element.backgroundColor,
    element.strokeWidth,
  ]);
}

function remember(key: string, value: SketchGeometry): SketchGeometry {
  if (geometryCache.has(key)) geometryCache.delete(key);
  geometryCache.set(key, value);
  while (geometryCache.size > GEOMETRY_CACHE_LIMIT) {
    const oldest = geometryCache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    geometryCache.delete(oldest);
  }
  return value;
}

function roundedPolygon(vertices: Point[], radius: number): Point[] {
  if (radius <= 0 || vertices.length < 3) return vertices;
  const result: Point[] = [];
  for (let index = 0; index < vertices.length; index += 1) {
    const previous = vertices[(index - 1 + vertices.length) % vertices.length]!;
    const current = vertices[index]!;
    const next = vertices[(index + 1) % vertices.length]!;
    const incoming = Math.hypot(current.x - previous.x, current.y - previous.y);
    const outgoing = Math.hypot(next.x - current.x, next.y - current.y);
    if (incoming === 0 || outgoing === 0) continue;
    const inset = Math.min(radius, incoming / 2, outgoing / 2);
    const start = point(
      current.x + ((previous.x - current.x) / incoming) * inset,
      current.y + ((previous.y - current.y) / incoming) * inset,
    );
    const end = point(
      current.x + ((next.x - current.x) / outgoing) * inset,
      current.y + ((next.y - current.y) / outgoing) * inset,
    );
    result.push(start);
    for (let step = 1; step <= 4; step += 1) {
      const t = step / 4;
      const inverse = 1 - t;
      result.push(
        point(
          inverse * inverse * start.x +
            2 * inverse * t * current.x +
            t * t * end.x,
          inverse * inverse * start.y +
            2 * inverse * t * current.y +
            t * t * end.y,
        ),
      );
    }
  }
  return result;
}

function shapeBoundary(element: Element): Point[] {
  const width = finite(element.width ?? 0);
  const height = finite(element.height ?? 0);
  if (element.type === "ellipse") {
    const rx = Math.abs(width) / 2;
    const ry = Math.abs(height) / 2;
    const circumference =
      Math.PI *
      (3 * (rx + ry) - Math.sqrt(Math.max(0, (3 * rx + ry) * (rx + 3 * ry))));
    const count = Math.max(24, Math.min(128, Math.ceil(circumference / 8)));
    const radius = sketchSettings(element.roughness).amplitude;
    const random = mulberry32(deriveSeed(element.seed, 0x46494c4c));
    return Array.from({ length: count }, (_, index) => {
      const angle = (index * Math.PI * 2) / count;
      const jitter = radius * (random() * 2 - 1) * 0.38;
      return point(
        rx + Math.cos(angle) * (rx + jitter),
        ry + Math.sin(angle) * (ry + jitter),
      );
    });
  }
  if (element.type === "diamond") {
    const halfWidth = Math.abs(width) / 2;
    const halfHeight = Math.abs(height) / 2;
    return roundedPolygon(
      [
        point(halfWidth, 0),
        point(Math.abs(width), halfHeight),
        point(halfWidth, Math.abs(height)),
        point(0, halfHeight),
      ],
      element.edgeStyle === "rounded"
        ? Math.min(12, halfWidth * 0.35, halfHeight * 0.35)
        : 0,
    );
  }
  return roundedPolygon(
    [point(0, 0), point(width, 0), point(width, height), point(0, height)],
    element.edgeStyle === "rounded"
      ? Math.min(12, Math.abs(width) * 0.2, Math.abs(height) * 0.2)
      : 0,
  );
}

function lineCommands(start: Point, end: Point): SketchCommand[] {
  return [
    { type: "M", x: start.x, y: start.y },
    { type: "L", x: end.x, y: end.y },
  ];
}

function bezierEdge(
  start: Point,
  end: Point,
  random: () => number,
  amplitude: number,
  overshoot: number,
  endpointJitter: number,
  parallelOffset = 0,
): SketchCommand[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return lineCommands(start, end);
  const tx = dx / length;
  const ty = dy / length;
  const nx = -ty;
  const ny = tx;
  const over = Math.min(overshoot, length * 0.08);
  const j0 = (random() * 2 - 1) * endpointJitter;
  const j1 = (random() * 2 - 1) * endpointJitter;
  const p0 = point(
    start.x - tx * over + nx * (j0 + parallelOffset),
    start.y - ty * over + ny * (j0 + parallelOffset),
  );
  const p1 = point(
    end.x + tx * over + nx * (j1 + parallelOffset),
    end.y + ty * over + ny * (j1 + parallelOffset),
  );
  const control = Math.min(amplitude, Math.max(0, length * 0.22));
  const c1 = random() * 2 - 1;
  const c2 = random() * 2 - 1;
  return [
    { type: "M", x: p0.x, y: p0.y },
    {
      type: "C",
      c1x: p0.x + dx / 3 + nx * c1 * control,
      c1y: p0.y + dy / 3 + ny * c1 * control,
      c2x: p1.x - dx / 3 + nx * c2 * control,
      c2y: p1.y - dy / 3 + ny * c2 * control,
      x: p1.x,
      y: p1.y,
    },
  ];
}

function contour(
  points: readonly Point[],
  jitter: number,
  seed: number,
): SketchCommand[] {
  const random = mulberry32(seed);
  const commands: SketchCommand[] = [];
  points.forEach((source, index) => {
    const dx = (random() * 2 - 1) * jitter;
    const dy = (random() * 2 - 1) * jitter;
    commands.push({
      type: index === 0 ? "M" : "L",
      x: source.x + dx,
      y: source.y + dy,
    });
  });
  if (points.length) commands.push({ type: "Z" });
  return commands;
}

function polygonOutlines(
  points: readonly Point[],
  element: Element,
): SketchCommand[][] {
  const settings = sketchSettings(element.roughness);
  if (points.length < 2) return [];
  if (settings.amplitude === 0) {
    return [
      [
        ...points.map((p, i) => ({
          type: i ? ("L" as const) : ("M" as const),
          x: p.x,
          y: p.y,
        })),
        { type: "Z" },
      ],
    ];
  }
  return [0, 1].map((pass) => {
    const random = mulberry32(deriveSeed(element.seed, 0x4f555400 + pass));
    const commands: SketchCommand[] = [];
    for (let index = 0; index < points.length; index += 1) {
      const start = points[index]!;
      const end = points[(index + 1) % points.length]!;
      const edgeLength = Math.hypot(end.x - start.x, end.y - start.y);
      commands.push(
        ...bezierEdge(
          start,
          end,
          random,
          settings.amplitude * (1 + Math.sqrt(edgeLength / 90)),
          settings.overshoot,
          settings.amplitude * (pass ? 0.34 : 0.2),
          pass ? settings.doubleStrokeOffset : 0,
        ),
      );
    }
    return commands;
  });
}

function ellipseOutlines(
  points: readonly Point[],
  element: Element,
): SketchCommand[][] {
  const settings = sketchSettings(element.roughness);
  const cx = Math.abs(element.width ?? 0) / 2;
  const cy = Math.abs(element.height ?? 0) / 2;
  const rx = cx;
  const ry = cy;
  if (settings.amplitude === 0) {
    return [
      [
        { type: "M", x: cx + rx, y: cy },
        {
          type: "C",
          c1x: cx + rx,
          c1y: cy + ry * 0.55228475,
          c2x: cx + rx * 0.55228475,
          c2y: cy + ry,
          x: cx,
          y: cy + ry,
        },
        {
          type: "C",
          c1x: cx - rx * 0.55228475,
          c1y: cy + ry,
          c2x: cx - rx,
          c2y: cy + ry * 0.55228475,
          x: cx - rx,
          y: cy,
        },
        {
          type: "C",
          c1x: cx - rx,
          c1y: cy - ry * 0.55228475,
          c2x: cx - rx * 0.55228475,
          c2y: cy - ry,
          x: cx,
          y: cy - ry,
        },
        {
          type: "C",
          c1x: cx + rx * 0.55228475,
          c1y: cy - ry,
          c2x: cx + rx,
          c2y: cy - ry * 0.55228475,
          x: cx + rx,
          y: cy,
        },
        { type: "Z" },
      ],
    ];
  }
  return [0, 1].map((pass) => {
    const random = mulberry32(deriveSeed(element.seed, 0x454c4c00 + pass));
    const jittered = points.map((p) => {
      const angle = Math.atan2(p.y - cy, p.x - cx);
      const offset =
        (random() * 2 - 1) * settings.amplitude +
        (pass ? settings.doubleStrokeOffset : 0);
      return point(
        cx + Math.cos(angle) * (rx + offset),
        cy + Math.sin(angle) * (ry + offset),
      );
    });
    const commands: SketchCommand[] = [
      { type: "M", x: jittered[0]!.x, y: jittered[0]!.y },
    ];
    for (let index = 0; index < jittered.length; index += 1) {
      const previous =
        jittered[(index - 1 + jittered.length) % jittered.length]!;
      const current = jittered[index]!;
      const next = jittered[(index + 1) % jittered.length]!;
      const following = jittered[(index + 2) % jittered.length]!;
      commands.push({
        type: "C",
        c1x: current.x + (next.x - previous.x) / 6,
        c1y: current.y + (next.y - previous.y) / 6,
        c2x: next.x - (following.x - current.x) / 6,
        c2y: next.y - (following.y - current.y) / 6,
        x: next.x,
        y: next.y,
      });
    }
    commands.push({ type: "Z" });
    return commands;
  });
}

/** Generate deterministic open strokes for lines and arrow shafts. */
export function getSketchLinePaths(
  points: readonly Point[],
  element: Element,
  stream = 0,
): SketchCommand[][] {
  if (points.length < 2) return [];
  const settings = sketchSettings(element.roughness);
  if (settings.amplitude === 0) {
    return [
      [
        ...points.map((p, index) => ({
          type: index === 0 ? ("M" as const) : ("L" as const),
          x: p.x,
          y: p.y,
        })),
      ],
    ];
  }
  return [0, 1].map((pass) => {
    const random = mulberry32(
      deriveSeed(element.seed, 0x4c494e45 + stream * 17 + pass),
    );
    return points
      .slice(0, -1)
      .flatMap((start, index) =>
        bezierEdge(
          start,
          points[index + 1]!,
          random,
          settings.amplitude,
          0,
          settings.amplitude * 0.12,
          pass ? settings.doubleStrokeOffset : 0,
        ),
      );
  });
}

function hatchSegments(
  boundary: readonly Point[],
  angle: number,
  spacing: number,
  offset: number,
): SketchSegment[] {
  if (boundary.length < 3) return [];
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const nx = -dy;
  const ny = dx;
  const projections = boundary.map((p) => p.x * nx + p.y * ny);
  const min = Math.min(...projections);
  const max = Math.max(...projections);
  const lineSpacing = Math.max(spacing, (max - min) / 2048);
  const first = Math.floor((min - offset) / lineSpacing) * lineSpacing + offset;
  const result: SketchSegment[] = [];
  const count = Math.min(
    2048,
    Math.max(0, Math.ceil((max - first) / lineSpacing)),
  );
  for (let line = 0; line <= count; line += 1) {
    const projection = first + line * lineSpacing;
    const intersections: number[] = [];
    for (let index = 0; index < boundary.length; index += 1) {
      const a = boundary[index]!;
      const b = boundary[(index + 1) % boundary.length]!;
      const pa = a.x * nx + a.y * ny;
      const pb = b.x * nx + b.y * ny;
      if (
        (pa <= projection && projection < pb) ||
        (pb <= projection && projection < pa)
      ) {
        const t = (projection - pa) / (pb - pa);
        intersections.push(
          (a.x + (b.x - a.x) * t) * dx + (a.y + (b.y - a.y) * t) * dy,
        );
      }
    }
    intersections.sort((a, b) => a - b);
    for (let index = 0; index + 1 < intersections.length; index += 2) {
      const start = intersections[index]!;
      const end = intersections[index + 1]!;
      if (end - start < 0.5) continue;
      result.push({
        start: point(
          dx * start + nx * projection,
          dy * start + ny * projection,
        ),
        end: point(dx * end + nx * projection, dy * end + ny * projection),
      });
    }
  }
  return result;
}

function makeGeometry(element: Element): SketchGeometry {
  const boundary = shapeBoundary(element);
  const fillContour = contour(
    boundary,
    sketchSettings(element.roughness).amplitude * 0.16,
    deriveSeed(element.seed, 0x46494c4c),
  );
  let outlines: SketchCommand[][];
  if (element.type === "ellipse") outlines = ellipseOutlines(boundary, element);
  else outlines = polygonOutlines(boundary, element);
  const style = element.fillStyle ?? "none";
  const spacing = Math.max(5, Math.min(16, (element.strokeWidth ?? 1) * 9));
  const first =
    style === "hachure" || style === "cross-hatch"
      ? hatchSegments(boundary, -Math.PI / 4, spacing, 0)
      : [];
  const second =
    style === "cross-hatch"
      ? hatchSegments(boundary, Math.PI / 4, spacing, spacing / 2)
      : [];
  return { outlines, fillContour, boundary, hatch: [first, second] };
}

/** Seeded, viewport-independent geometry used by both canvas and SVG renderers. */
export function getSketchGeometry(element: Element): SketchGeometry {
  const key = geometryKey(element);
  const cached = geometryCache.get(key);
  if (cached) {
    geometryCache.delete(key);
    geometryCache.set(key, cached);
    return cached;
  }
  return remember(key, makeGeometry(element));
}

export function clearSketchGeometryCache(): void {
  geometryCache.clear();
}

export function getSketchGeometryCacheSize(): number {
  return geometryCache.size;
}
