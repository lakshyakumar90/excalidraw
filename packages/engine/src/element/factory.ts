import type { BaseElement, Element } from "@repo/common";

function generateElementId(): string {
  return crypto.randomUUID();
}

//seed is important because your eventual hand-drawn renderer needs deterministic randomness
function generateSeed(): number {
  return Math.floor(Math.random() * 2_147_483_647);
}

export function createRectangleElement(options: BaseElement): Element {
  return {
    id: generateElementId(),
    type: "rectangle",
    x: options.x,
    y: options.y,
    width: options.width ?? 0,
    height: options.height ?? 0,
    angle: 0,
    strokeColor: options.strokeColor ?? "#000000",
    backgroundColor: options.backgroundColor ?? "transparent",
    fillStyle: options.fillStyle ?? "none",
    strokeWidth: options.strokeWidth ?? 1,
    strokeStyle: options.strokeStyle ?? "solid",
    roughness: options.roughness ?? 1,
    opacity: options.opacity ?? 100,
    seed: generateSeed(),
    groupIds: [],
    boundElements: [],
    frameId: null,
    version: 1,
    versionNonce: generateSeed(),
    isDeleted: false,
    updated: Date.now(),
  };
}
