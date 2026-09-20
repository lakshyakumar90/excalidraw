import type {
  BaseElement,
  DiamondElement,
  LineElement,
  EllipseElement,
  RectangleElement,
  Point,
  ArrowElement,
  FreedrawElement,
} from "@repo/common";
import { getPolylineBounds, toLocalPoints } from "../geometry";

export type ElementOptions = Partial<BaseElement>;

export interface CreateLineElementOptions extends ElementOptions {
  points: Point[];
  lineType?: "straight" | "curved";
}

function generateElementId(): string {
  return crypto.randomUUID();
}

//seed is important because your eventual hand-drawn renderer needs deterministic randomness
function generateSeed(): number {
  return Math.floor(Math.random() * 2_147_483_647);
}

export function createRectangleElement(
  options: ElementOptions = {},
): RectangleElement {
  return {
    id: options.id ?? generateElementId(),
    type: "rectangle",
    x: options.x ?? 0,
    y: options.y ?? 0,
    width: options.width ?? 0,
    height: options.height ?? 0,
    angle: options.angle ?? 0,
    strokeColor: options.strokeColor ?? "#000000",
    backgroundColor: options.backgroundColor ?? "transparent",
    fillStyle: options.fillStyle ?? "none",
    strokeWidth: options.strokeWidth ?? 1,
    strokeStyle: options.strokeStyle ?? "solid",
    roughness: options.roughness ?? 1,
    opacity: options.opacity ?? 100,
    seed: options.seed ?? generateSeed(),
    groupIds: options.groupIds ?? [],
    boundElements: options.boundElements ?? [],
    frameId: options.frameId ?? null,
    version: options.version ?? 1,
    versionNonce: options.versionNonce ?? generateSeed(),
    isDeleted: options.isDeleted ?? false,
    updated: options.updated ?? Date.now(),
  };
}

export function createEllipseElement(options: ElementOptions): EllipseElement {
  const now = Date.now();

  return {
    id: generateElementId(),
    type: "ellipse",
    x: options.x ?? 0,
    y: options.y ?? 0,
    width: options.width ?? 0,
    height: options.height ?? 0,
    angle: 0,
    strokeColor: options.strokeColor ?? "#1e1e1e",
    backgroundColor: options.backgroundColor ?? "transparent",
    fillStyle: options.fillStyle ?? "none",
    strokeWidth: options.strokeWidth ?? 1,
    strokeStyle: options.strokeStyle ?? "solid",
    roughness: options.roughness ?? 1,
    opacity: options.opacity ?? 100,
    seed: options.seed ?? generateSeed(),
    groupIds: [],
    boundElements: [],
    frameId: null,
    version: 1,
    versionNonce: generateSeed(),
    isDeleted: false,
    updated: now,
  };
}

export function createDiamondElement(options: ElementOptions): DiamondElement {
  const now = Date.now();

  return {
    id: generateElementId(),
    type: "diamond",
    x: options.x ?? 0,
    y: options.y ?? 0,
    width: options.width ?? 0,
    height: options.height ?? 0,
    angle: 0,
    strokeColor: options.strokeColor ?? "#1e1e1e",
    backgroundColor: options.backgroundColor ?? "transparent",
    fillStyle: options.fillStyle ?? "none",
    strokeWidth: options.strokeWidth ?? 1,
    strokeStyle: options.strokeStyle ?? "solid",
    roughness: options.roughness ?? 1,
    opacity: options.opacity ?? 100,
    seed: options.seed ?? generateSeed(),
    groupIds: [],
    boundElements: [],
    frameId: null,
    version: 1,
    versionNonce: generateSeed(),
    isDeleted: false,
    updated: now,
  };
}

export function createLineElement(
  options: CreateLineElementOptions,
): LineElement {
  const now = Date.now();

  return {
    id: generateElementId(),
    type: "line",
    x: options.x ?? 0,
    y: options.y ?? 0,
    width: options.width ?? 0,
    height: options.height ?? 0,
    angle: 0,
    strokeColor: options.strokeColor ?? "#1e1e1e",
    backgroundColor: options.backgroundColor ?? "transparent",
    fillStyle: options.fillStyle ?? "none",
    strokeWidth: options.strokeWidth ?? 1,
    strokeStyle: options.strokeStyle ?? "solid",
    roughness: options.roughness ?? 1,
    opacity: options.opacity ?? 100,
    seed: options.seed ?? generateSeed(),
    groupIds: [],
    boundElements: [],
    frameId: null,
    version: 1,
    versionNonce: generateSeed(),
    isDeleted: false,
    updated: now,
    points: options.points,
    lineType: options.lineType ?? "straight",
  };
}

export function createPolylineElement(points: readonly Point[]) {
  const bounds = getPolylineBounds(points);
  const localPoints = toLocalPoints(points, bounds);

  return createLineElement({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    points: localPoints,
  });
}

export function createArrowElement(start: Point, end: Point): ArrowElement {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);

  return {
    id: crypto.randomUUID(),
    type: "arrow",
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "none",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    seed: Math.floor(Math.random() * 2_147_483_647),
    groupIds: [],
    boundElements: [],
    frameId: null,
    version: 1,
    versionNonce: Math.floor(Math.random() * 2_147_483_647),
    isDeleted: false,
    updated: Date.now(),
    points: [
      {
        x: start.x - x,
        y: start.y - y,
      },
      {
        x: end.x - x,
        y: end.y - y,
      },
    ],
  };
}

export function createLineElementFromPoints(
  points: Point[],
  lineType: "straight" | "curved" = "straight",
): LineElement {
  if (points.length < 2) {
    throw new Error("A line requires at least two points");
  }

  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));

  return {
    id: crypto.randomUUID(),
    type: "line",
    x: minX ?? 0,
    y: minY ?? 0,
    width: (maxX ?? 0) - (minX ?? 0),
    height: (maxY ?? 0) - (minY ?? 0),
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "none",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    seed: Math.floor(Math.random() * 2_147_483_647),
    groupIds: [],
    boundElements: [],
    frameId: null,
    version: 1,
    versionNonce: Math.floor(Math.random() * 2_147_483_647),
    isDeleted: false,
    updated: Date.now(),
    lineType,
    points: points.map((point) => ({
      x: point.x - (minX ?? 0),
      y: point.y - (minY ?? 0),
    })),
  };
}

export function createFreedrawElementFromPoints(
  points: Point[],
): FreedrawElement {
  if (points.length < 2) {
    throw new Error("A freedraw stroke requires at least two points");
  }

  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));

  return {
    id: crypto.randomUUID(),
    type: "freedraw",
    x: minX ?? 0,
    y: minY ?? 0,
    width: (maxX ?? 0) - (minX ?? 0),
    height: (maxY ?? 0) - (minY ?? 0),
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "none",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    seed: Math.floor(Math.random() * 2_147_483_647),
    groupIds: [],
    boundElements: [],
    frameId: null,
    version: 1,
    versionNonce: Math.floor(Math.random() * 2_147_483_647),
    isDeleted: false,
    updated: Date.now(),
    points: points.map((point) => ({
      x: point.x - (minX ?? 0),
      y: point.y - (minY ?? 0),
    })),
  };
}
