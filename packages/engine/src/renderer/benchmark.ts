import type { Element } from "@repo/common";
import {
  createArrowElement,
  createDiamondElement,
  createEllipseElement,
  createLineElement,
  createRectangleElement,
} from "../element/factory";
import { mulberry32 } from "./sketch/prng";

const colors = ["#1e1e1e", "#7048e8", "#d9480f", "#087f5b"] as const;
const fills = ["none", "solid", "hachure", "cross-hatch"] as const;

/** Deterministic in-memory stress scene; it never writes to the user's scene or database. */
export function createRendererStressScene(
  count = 5_000,
  seed = 0x18_05_2026,
  columns = 100,
): Element[] {
  const safeCount = Math.max(0, Math.min(5_000, Math.floor(count)));
  const safeColumns = Math.max(1, Math.floor(columns));
  const random = mulberry32(seed);
  const elements: Element[] = [];
  for (let index = 0; index < safeCount; index += 1) {
    const x = (index % safeColumns) * 12;
    const y = Math.floor(index / safeColumns) * 12;
    const width = 18 + Math.floor(random() * 16);
    const height = 15 + Math.floor(random() * 17);
    const style = {
      x,
      y,
      width,
      height,
      strokeColor: colors[index % colors.length]!,
      backgroundColor:
        fills[index % fills.length] === "none" ? "transparent" : "#f1d4ff",
      fillStyle: fills[index % fills.length]!,
      strokeWidth: 1 + (index % 3),
      roughness: index % 3,
      edgeStyle: index % 2 ? ("rounded" as const) : ("sharp" as const),
      seed: (seed + index * 7919) >>> 0,
      version: 1,
      versionNonce: (seed + index * 104729) >>> 0,
      updated: 0,
    };
    const id = `renderer-stress-${index}`;
    switch (index % 5) {
      case 0:
        elements.push(createRectangleElement({ ...style, id }));
        break;
      case 1:
        elements.push({
          ...createEllipseElement(style),
          ...style,
          id,
          type: "ellipse",
        });
        break;
      case 2:
        elements.push({
          ...createDiamondElement(style),
          ...style,
          id,
          type: "diamond",
        });
        break;
      case 3:
        elements.push({
          ...createLineElement({
            ...style,
            points: [
              { x: 0, y: 0 },
              { x: width, y: height },
            ],
          }),
          ...style,
          id,
          type: "line",
          lineType: index % 2 ? "curved" : "straight",
          points: [
            { x: 0, y: 0 },
            { x: width, y: height },
          ],
        });
        break;
      default:
        elements.push({
          ...createArrowElement({ x, y }, { x: x + width, y: y + height }),
          ...style,
          id,
          type: "arrow",
          points: [
            { x: 0, y: 0 },
            { x: width, y: height },
          ],
        });
    }
  }
  return elements;
}
