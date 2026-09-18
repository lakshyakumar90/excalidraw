import type { BaseElement, Element } from "@repo/common";

export type ElementOptions = Partial<Omit<BaseElement, "id" | "type">>;

function generateElementId(): string {
  return crypto.randomUUID();
}

//seed is important because your eventual hand-drawn renderer needs deterministic randomness
function generateSeed(): number {
  return Math.floor(Math.random() * 2_147_483_647);
}

export function createRectangleElement(options: ElementOptions): Element {
  return {
    id: generateElementId(),
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
