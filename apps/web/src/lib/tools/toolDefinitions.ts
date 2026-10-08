import type { ToolType } from "@repo/engine";

export const TOOL_LABELS: Record<ToolType, string> = {
  selection: "Select",
  text: "Text",
  hand: "Hand",
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  diamond: "Diamond",
  line: "Line",
  multiPointLine: "Multi-point line",
  arrow: "Arrow",
  "curved-line": "Curve",
  freedraw: "Pencil",
  eraser: "Eraser",
};

export const TOOL_SHORTCUTS: Record<ToolType, string> = {
  selection: "V",
  text: "T",
  hand: "H",
  rectangle: "R",
  ellipse: "O",
  diamond: "D",
  line: "L",
  multiPointLine: "P",
  arrow: "A",
  "curved-line": "C",
  freedraw: "F",
  eraser: "E",
};

export const TOOL_TYPES = Object.keys(TOOL_LABELS) as ToolType[];

export function getToolForShortcut(key: string): ToolType | undefined {
  return TOOL_TYPES.find(
    (type) => TOOL_SHORTCUTS[type].toLowerCase() === key.toLowerCase(),
  );
}
