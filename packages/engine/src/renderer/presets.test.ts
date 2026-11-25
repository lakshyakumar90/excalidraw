import { describe, expect, it } from "vitest";
import {
  applyBoardPresetToElements,
  BOARD_PRESET_LIST,
  BOARD_PRESETS,
  getBoardPreset,
} from "@repo/common";
import { sketchSettingsForPreset } from "./sketch/settings";

describe("4 JojoPen-style board presets & multi-font engine", () => {
  it("defines all board presets with distinct typography and palettes", () => {
    expect(BOARD_PRESET_LIST.map((p) => p.id)).toEqual([
      "sketch",
      "clean-sketch",
      "chalk-bold",
      "excali-font",
      "black-and-white",
    ]);

    expect(BOARD_PRESETS["black-and-white"].dotGrid).toBe(true);
    expect(BOARD_PRESETS["excali-font"].roughness).toBe(1.2);
    expect(BOARD_PRESETS["excali-font"].fontFamily).toContain("Caveat");
    expect(BOARD_PRESETS["chalk-bold"].canvasBackgroundDark).toBe("#0E1210");
    expect(BOARD_PRESETS["chalk-bold"].strokeWidth).toBeGreaterThanOrEqual(3);
    expect(BOARD_PRESETS["chalk-bold"].chalkTexture).toBe(true);
    expect(BOARD_PRESETS["clean-sketch"].roughness).toBe(0.35);
  });

  it("produces deterministic mulberry32 chalk dual-pass settings for chalk-bold", () => {
    const a = sketchSettingsForPreset("chalk-bold", 42);
    const b = sketchSettingsForPreset("chalk-bold", 42);
    expect(a).toEqual(b);
    expect(a.chalkPassCount).toBe(2);
    expect(a.chalkJitter).toBeGreaterThan(0);

    const clean = sketchSettingsForPreset("clean-sketch", 42);
    expect(clean.amplitude).toBeLessThan(a.amplitude);
  });

  it("restyles board elements cleanly in one atomic pass for undoable history commits", () => {
    const elements = [
      { id: "r1", type: "rectangle", strokeColor: "#3B82F6", strokeWidth: 2, roughness: 1, version: 1, versionNonce: 10 },
      { id: "t1", type: "text", strokeColor: "#111111", strokeWidth: 2, roughness: 1, fontFamily: "Inter", version: 1, versionNonce: 20 },
    ];

    const chalked = applyBoardPresetToElements(elements, "chalk-bold");
    expect(chalked[0]!.strokeWidth).toBeGreaterThanOrEqual(3);
    expect(chalked[0]!.roughness).toBe(getBoardPreset("chalk-bold").roughness);
    expect(chalked[1]!.fontFamily).toContain("Architects Daughter");
    expect(chalked[0]!.version).toBe(2);
  });
});
