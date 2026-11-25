export type BoardPresetId =
  | "black-and-white"
  | "excali-font"
  | "chalk-bold"
  | "clean-sketch";

export interface BoardPresetConfig {
  id: BoardPresetId;
  name: string;
  description: string;
  fontFamily: string;
  cssFontVar: string;
  defaultStrokeColor: string;
  defaultBackgroundColor: string;
  strokeWidth: number;
  roughness: number;
  dotGrid: boolean;
  chalkTexture: boolean;
  canvasBackgroundDark?: string;
  canvasBackgroundLight?: string;
  palette: readonly string[];
}

export const BOARD_PRESETS: Readonly<Record<BoardPresetId, BoardPresetConfig>> = {
  "black-and-white": {
    id: "black-and-white",
    name: "Black & White",
    description: "High-contrast monochrome ink with subtle dot grid",
    fontFamily: "Inter, sans-serif",
    cssFontVar: "var(--font-inter)",
    defaultStrokeColor: "#111827",
    defaultBackgroundColor: "transparent",
    strokeWidth: 2,
    roughness: 0.6,
    dotGrid: true,
    chalkTexture: false,
    palette: ["#111827", "#374151", "#6B7280", "#9CA3AF", "#F1F5F9"],
  },
  "excali-font": {
    id: "excali-font",
    name: "Excali Font",
    description: "Warm hand-drawn marker aesthetic with Caveat script",
    fontFamily: "Caveat, cursive",
    cssFontVar: "var(--font-caveat)",
    defaultStrokeColor: "#1E293B",
    defaultBackgroundColor: "transparent",
    strokeWidth: 2,
    roughness: 1.2,
    dotGrid: false,
    chalkTexture: false,
    palette: ["#1E293B", "#F97316", "#3B82F6", "#10B981", "#A855F7", "#EF4444"],
  },
  "chalk-bold": {
    id: "chalk-bold",
    name: "Chalk Bold",
    description: "Deep chalkboard canvas with thick pastel chalk strokes",
    fontFamily: "'Architects Daughter', cursive",
    cssFontVar: "var(--font-chalk)",
    defaultStrokeColor: "#F8FAFC",
    defaultBackgroundColor: "transparent",
    strokeWidth: 3.5,
    roughness: 1.8,
    dotGrid: false,
    chalkTexture: true,
    canvasBackgroundDark: "#141A18",
    canvasBackgroundLight: "#1B2420",
    palette: ["#F8FAFC", "#FEF08A", "#BAE6FD", "#FDA4AF", "#A7F3D0"],
  },
  "clean-sketch": {
    id: "clean-sketch",
    name: "Clean Sketch",
    description: "Minimal architectural precision with crisp sans/mono type",
    fontFamily: "Inter, 'JetBrains Mono', sans-serif",
    cssFontVar: "var(--font-inter)",
    defaultStrokeColor: "#334155",
    defaultBackgroundColor: "transparent",
    strokeWidth: 1.5,
    roughness: 0.35,
    dotGrid: true,
    chalkTexture: false,
    palette: ["#334155", "#60A5FA", "#34D399", "#FBBF24", "#C084FC", "#F87171"],
  },
};

export const BOARD_PRESET_LIST: readonly BoardPresetConfig[] = [
  BOARD_PRESETS["black-and-white"],
  BOARD_PRESETS["excali-font"],
  BOARD_PRESETS["chalk-bold"],
  BOARD_PRESETS["clean-sketch"],
];

export function isBoardPresetId(value: unknown): value is BoardPresetId {
  return typeof value === "string" && Object.hasOwn(BOARD_PRESETS, value);
}

export function getBoardPreset(presetId: BoardPresetId = "excali-font"): BoardPresetConfig {
  return isBoardPresetId(presetId) ? BOARD_PRESETS[presetId] : BOARD_PRESETS["excali-font"];
}

/**
 * Deterministically restyles a list of elements to match a BoardPreset.
 * Callers can push the resulting element array as a single undoable HistoryManager entry.
 */
export function applyBoardPresetToElements<
  T extends {
    id: string;
    type: string;
    strokeColor?: string;
    strokeWidth?: number;
    roughness?: number;
    fontFamily?: string;
    version?: number;
    versionNonce?: number;
  },
>(elements: readonly T[], presetId: BoardPresetId): T[] {
  const preset = getBoardPreset(presetId);
  return elements.map((el, idx) => {
    const nextColor =
      presetId === "black-and-white"
        ? preset.palette[idx % preset.palette.length]!
        : presetId === "chalk-bold"
          ? preset.palette[idx % preset.palette.length]!
          : el.strokeColor ?? preset.defaultStrokeColor;
    const nextStrokeWidth =
      presetId === "chalk-bold"
        ? Math.max(3, preset.strokeWidth)
        : preset.strokeWidth;
    return {
      ...el,
      strokeColor: nextColor,
      strokeWidth: nextStrokeWidth,
      roughness: preset.roughness,
      ...(el.type === "text" ? { fontFamily: preset.fontFamily } : {}),
      version: (el.version ?? 0) + 1,
      versionNonce: ((el.versionNonce ?? 1) * 1664525 + 1013904223) >>> 0,
    };
  });
}
