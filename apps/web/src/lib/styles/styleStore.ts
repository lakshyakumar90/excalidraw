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

const STORAGE_KEY = "excalidraw:current-item-style:v1";
const STORAGE_VERSION = 1;

let currentItemStyle = DEFAULT_STYLE;
let hasHydrated = false;
const listeners = new Set<Listener>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
}

function isBackgroundColor(value: unknown): value is string {
  return value === "transparent" || isHexColor(value);
}

function isCurrentItemStyle(value: unknown): value is CurrentItemStyle {
  if (!isRecord(value)) return false;

  return (
    isHexColor(value.strokeColor) &&
    isBackgroundColor(value.backgroundColor) &&
    (value.fillStyle === "none" ||
      value.fillStyle === "solid" ||
      value.fillStyle === "hachure" ||
      value.fillStyle === "cross-hatch") &&
    (value.strokeWidth === 1 ||
      value.strokeWidth === 2 ||
      value.strokeWidth === 4) &&
    (value.strokeStyle === "solid" ||
      value.strokeStyle === "dashed" ||
      value.strokeStyle === "dotted") &&
    (value.roughness === 0 || value.roughness === 1 || value.roughness === 2) &&
    (value.edgeStyle === "sharp" || value.edgeStyle === "rounded") &&
    typeof value.opacity === "number" &&
    Number.isFinite(value.opacity) &&
    value.opacity >= 0 &&
    value.opacity <= 100
  );
}

function persistCurrentItemStyle(): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, style: currentItemStyle }),
    );
  } catch {
    // Storage can be unavailable in private browsing or when the browser quota is full.
  }
}

function notify() {
  for (const listener of listeners) listener();
}

export const styleStore = {
  hydrate(): void {
    if (hasHydrated || typeof window === "undefined") return;
    hasHydrated = true;

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const saved: unknown = JSON.parse(raw);
      if (
        !isRecord(saved) ||
        saved.version !== STORAGE_VERSION ||
        !isCurrentItemStyle(saved.style)
      ) {
        return;
      }

      currentItemStyle = { ...saved.style };
      notify();
    } catch {
      // Ignore malformed saved data and continue with the in-memory defaults.
    }
  },

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
    persistCurrentItemStyle();
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
    persistCurrentItemStyle();
    notify();
  },
};
