import { describe, expect, it } from "vitest";
import type { Element } from "@repo/common";
import { adaptColorForTheme, getCanvasThemePalette } from "./theme";
import { cachedShapeKey } from "./bitmapRendering";

function sampleRect(): Element {
  return {
    id: "rect-theme-1",
    type: "rectangle",
    x: 0,
    y: 0,
    width: 120,
    height: 80,
    angle: 0,
    strokeColor: "#111111",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    seed: 42,
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    groupIds: [],
    boundElements: null,
    updated: 1,
    order: "a0",
  } as unknown as Element;
}

describe("dark/light theme engine", () => {
  it("adapts dark neutral strokes to crisp off-white on dark canvas and flips white ink on light canvas", () => {
    expect(adaptColorForTheme("#111111", "dark")).toBe("#F1F5F9");
    expect(adaptColorForTheme("#000000", "dark")).toBe("#F1F5F9");
    expect(adaptColorForTheme("#F1F5F9", "light")).toBe("#111827");
    expect(adaptColorForTheme("#FFFFFF", "light")).toBe("#111827");
    expect(adaptColorForTheme("transparent", "dark")).toBe("transparent");
    expect(adaptColorForTheme("transparent", "light")).toBe("transparent");
  });

  it("preserves readable semantic hues across themes", () => {
    // Vibrant blue/emerald/coral stay untouched
    expect(adaptColorForTheme("#3B82F6", "dark")).toBe("#3B82F6");
    expect(adaptColorForTheme("#10B981", "dark")).toBe("#10B981");
    expect(adaptColorForTheme("#3B82F6", "light")).toBe("#3B82F6");
    // Very dark navy lifts for readability on dark canvas without turning gray
    const lifted = adaptColorForTheme("#0F172A", "dark");
    expect(lifted).not.toBe("#0F172A");
  });

  it("produces distinct bitmap cache keys for dark vs light theme to prevent cache ghosts", () => {
    const el = sampleRect();
    const darkKey = cachedShapeKey(el, 1, 2, "dark");
    const lightKey = cachedShapeKey(el, 1, 2, "light");
    expect(darkKey).not.toBe(lightKey);
  });

  it("exposes semantic dark and light canvas palettes", () => {
    expect(getCanvasThemePalette("dark").background).toBe("#0D1117");
    expect(getCanvasThemePalette("light").background).toBe("#FFFFFF");
  });
});
