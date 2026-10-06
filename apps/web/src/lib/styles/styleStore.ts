export type FillStyle = "none" | "solid" | "hachure" | "cross-hatch";
export type StrokeStyle = "solid" | "dashed" | "dotted";
import type { EdgeStyle, Element } from "@repo/common";
export type { EdgeStyle } from "@repo/common";

export interface CurrentItemStyle {
  strokeColor: string;
  backgroundColor: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  roughness: number;
  edgeStyle: EdgeStyle;
  opacity: number;
}

type Listener = () => void;

const DEFAULT_STYLE: CurrentItemStyle = {
  strokeColor: "#000000",
  backgroundColor: "transparent",
  fillStyle: "none",
  strokeWidth: 1,
  strokeStyle: "solid",
  roughness: 1,
  edgeStyle: "sharp",
  opacity: 100,
};

let currentItemStyle = DEFAULT_STYLE;
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) listener();
}

export const styleStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot(): CurrentItemStyle {
    return currentItemStyle;
  },

  loadFromElement(element: Element): void {
    const nextStyle: CurrentItemStyle = {
      strokeColor: element.strokeColor ?? DEFAULT_STYLE.strokeColor,
      backgroundColor: element.backgroundColor ?? DEFAULT_STYLE.backgroundColor,
      fillStyle:
        element.fillStyle === "none" &&
        element.backgroundColor !== "transparent"
          ? "solid"
          : (element.fillStyle ?? DEFAULT_STYLE.fillStyle),
      strokeWidth: element.strokeWidth ?? DEFAULT_STYLE.strokeWidth,
      strokeStyle: element.strokeStyle ?? DEFAULT_STYLE.strokeStyle,
      roughness: element.roughness ?? DEFAULT_STYLE.roughness,
      edgeStyle: element.edgeStyle ?? DEFAULT_STYLE.edgeStyle,
      opacity: element.opacity ?? DEFAULT_STYLE.opacity,
    };

    if (
      Object.keys(nextStyle).every((key) => {
        const styleKey = key as keyof CurrentItemStyle;
        return Object.is(currentItemStyle[styleKey], nextStyle[styleKey]);
      })
    )
      return;

    currentItemStyle = nextStyle;
    notify();
  },

  getElementStyle(): Pick<
    Element,
    | "strokeColor"
    | "backgroundColor"
    | "fillStyle"
    | "strokeWidth"
    | "strokeStyle"
    | "roughness"
    | "edgeStyle"
    | "opacity"
  > {
    return { ...currentItemStyle };
  },

  set<K extends keyof CurrentItemStyle>(key: K, value: CurrentItemStyle[K]) {
    if (Object.is(currentItemStyle[key], value)) return;
    currentItemStyle = { ...currentItemStyle, [key]: value };
    notify();
  },

  update(changes: Partial<CurrentItemStyle>): void {
    const nextStyle = { ...currentItemStyle, ...changes };
    if (
      Object.keys(nextStyle).every((key) => {
        const styleKey = key as keyof CurrentItemStyle;
        return Object.is(currentItemStyle[styleKey], nextStyle[styleKey]);
      })
    )
      return;

    currentItemStyle = nextStyle;
    notify();
  },
};
