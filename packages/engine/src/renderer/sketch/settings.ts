import type { BoardPresetId } from "@repo/common";
import { getBoardPreset } from "@repo/common";
import { mulberry32 } from "./prng";

export interface SketchSettings {
  amplitude: number;
  overshoot: number;
  doubleStrokeOffset: number;
  chalkPassCount?: number;
  chalkJitter?: number;
}

/** Existing persisted roughness values map to Architect, Artist, Cartoonist. */
export const SKETCH_PRESETS: Readonly<Record<0 | 1 | 2, SketchSettings>> = {
  0: { amplitude: 0, overshoot: 0, doubleStrokeOffset: 0 },
  1: { amplitude: 0.55, overshoot: 0.35, doubleStrokeOffset: 0.18 },
  2: { amplitude: 1.15, overshoot: 0.7, doubleStrokeOffset: 0.4 },
};

export function sketchSettings(roughness: number | undefined): SketchSettings {
  const preset = Math.max(0, Math.min(2, Math.round(roughness ?? 1))) as
    0 | 1 | 2;
  return SKETCH_PRESETS[preset];
}

/**
 * Resolves sketch rendering parameters for a named JojoPen BoardPreset,
 * including deterministic mulberry32 dual-pass chalk jitter for `chalk-bold`.
 */
export function sketchSettingsForPreset(
  presetId: BoardPresetId,
  seed = 1,
): SketchSettings {
  const preset = getBoardPreset(presetId);
  if (preset.chalkTexture) {
    const rng = mulberry32(seed);
    return {
      amplitude: 1.9 + rng() * 0.5,
      overshoot: 1.6,
      doubleStrokeOffset: 1.35,
      chalkPassCount: 2,
      chalkJitter: 0.85 + rng() * 0.35,
    };
  }
  if (presetId === "clean-sketch") {
    return { amplitude: 0.45, overshoot: 0.4, doubleStrokeOffset: 0.25 };
  }
  if (presetId === "black-and-white") {
    return { amplitude: 0.75, overshoot: 0.6, doubleStrokeOffset: 0.4 };
  }
  // excali-font
  return { amplitude: 1.4, overshoot: 1.2, doubleStrokeOffset: 0.8 };
}
