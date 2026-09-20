import type {
  BaseElement,
  DiamondElement,
  LineElement,
  EllipseElement,
  RectangleElement,
  Point,
} from "@repo/common";

export type ElementOptions = Partial<BaseElement>;

export interface CreateLineElementOptions extends ElementOptions {
  points: Point[];
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
  };
}
