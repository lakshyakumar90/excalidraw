import type { Element } from "@repo/common";

export type CanvasTheme = "dark" | "light";

export interface CanvasThemePalette {
  background: string;
  grid: string;
  dotGrid: string;
  origin: string;
  frameBorder: string;
  frameLabel: string;
}

export const CANVAS_THEME_PALETTES: Readonly<Record<CanvasTheme, CanvasThemePalette>> = {
  dark: {
    background: "#080808",
    grid: "rgba(255, 255, 255, 0.055)",
    dotGrid: "rgba(255, 255, 255, 0.13)",
    origin: "rgba(255, 255, 255, 0.26)",
    frameBorder: "rgba(255, 255, 255, 0.32)",
    frameLabel: "#A1A1AA",
  },
  light: {
    background: "#FFFFFF",
    grid: "#E5E7EB",
    dotGrid: "#CBD5E1",
    origin: "#94A3B8",
    frameBorder: "#94A3B8",
    frameLabel: "#475569",
  },
};

export function getCanvasThemePalette(theme: CanvasTheme = "light"): CanvasThemePalette {
  return CANVAS_THEME_PALETTES[theme];
}

function parseHexColor(input: string): { r: number; g: number; b: number; a?: string } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("#")) return null;
  const hex = trimmed.slice(1);
  if (hex.length === 3) {
    const r = parseInt(hex[0]! + hex[0]!, 16);
    const g = parseInt(hex[1]! + hex[1]!, 16);
    const b = parseInt(hex[2]! + hex[2]!, 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return { r, g, b };
  }
  if (hex.length === 6 || hex.length === 8) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return { r, g, b, a: hex.length === 8 ? hex.slice(6, 8) : undefined };
  }
  return null;
}

function relativeLuminance(r: number, g: number, b: number): number {
  const linear = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number, alpha?: string): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (v: number) =>
    Math.round(Math.max(0, Math.min(255, v * 255)))
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}${alpha ? alpha.toUpperCase() : ""}`;
}

/**
 * Deterministically adapts a hex color for dark or light canvas backgrounds
 * so ink strokes stay AAA-readable while preserving intentional semantic hues.
 */
export function adaptColorForTheme(
  color: string | undefined,
  theme: CanvasTheme,
): string {
  if (!color) return theme === "dark" ? "#F1F5F9" : "#111827";
  const normalized = color.trim().toLowerCase();
  if (
    normalized === "transparent" ||
    normalized === "none" ||
    normalized === ""
  ) {
    return color;
  }

  const parsed = parseHexColor(color);
  if (!parsed) return color;

  const lum = relativeLuminance(parsed.r, parsed.g, parsed.b);
  const [h, s, l] = rgbToHsl(parsed.r, parsed.g, parsed.b);

  if (theme === "dark") {
    // Near-black / dark charcoal neutral ink -> crisp off-white
    if (lum < 0.14 && s < 0.25) {
      return parsed.a ? `#F1F5F9${parsed.a.toUpperCase()}` : "#F1F5F9";
    }
    // Very dark saturated colors -> lift lightness for dark-canvas contrast while preserving hue
    if (lum < 0.16 && s >= 0.25) {
      return hslToHex(h, Math.min(1, s * 0.95), Math.max(0.62, 1 - l * 0.65), parsed.a);
    }
    return color;
  }

  // Light theme: pure white / near-white neutral strokes -> crisp deep ink
  if (lum > 0.85 && (s < 0.45 || l > 0.92)) {
    return parsed.a ? `#111827${parsed.a.toUpperCase()}` : "#111827";
  }
  return color;
}

/**
 * Returns a theme-adapted shallow copy of an element for rendering without
 * mutating the persisted scene state.
 */
export function adaptElementForTheme<T extends Element>(
  element: T,
  theme: CanvasTheme,
): T {
  const nextStroke = adaptColorForTheme(element.strokeColor, theme);
  const hasBg =
    typeof element.backgroundColor === "string" &&
    element.backgroundColor.trim() !== "" &&
    element.backgroundColor.trim().toLowerCase() !== "transparent";
  const nextBg = hasBg
    ? adaptColorForTheme(element.backgroundColor, theme)
    : element.backgroundColor;

  if (
    nextStroke === element.strokeColor &&
    nextBg === element.backgroundColor
  ) {
    return element;
  }
  return {
    ...element,
    strokeColor: nextStroke,
    backgroundColor: nextBg,
  };
}
