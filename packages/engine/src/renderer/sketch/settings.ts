export interface SketchSettings {
  amplitude: number;
  overshoot: number;
  doubleStrokeOffset: number;
}

/** Existing persisted roughness values map to Architect, Artist, Cartoonist. */
export const SKETCH_PRESETS: Readonly<Record<0 | 1 | 2, SketchSettings>> = {
  0: { amplitude: 0, overshoot: 0, doubleStrokeOffset: 0 },
  1: { amplitude: 1.25, overshoot: 1.1, doubleStrokeOffset: 0.7 },
  2: { amplitude: 2.6, overshoot: 2.2, doubleStrokeOffset: 1.45 },
};

export function sketchSettings(roughness: number | undefined): SketchSettings {
  const preset = Math.max(0, Math.min(2, Math.round(roughness ?? 1))) as
    0 | 1 | 2;
  return SKETCH_PRESETS[preset];
}
