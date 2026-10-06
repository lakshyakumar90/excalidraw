/** Fixed spacing shared by text measurement and canvas rendering. */
export const TEXT_LINE_HEIGHT = 1.2;
export const DEFAULT_TEXT_FONT_SIZE = 20;
export const DEFAULT_TEXT_FONT_FAMILY = "sans-serif";

export interface TextMeasurement {
  width: number;
  height: number;
  lineHeight: number;
}

type MeasureContext =
  CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

let measurementContext: MeasureContext | null | undefined;
const widthCache = new Map<string, number>();
const MAX_CACHED_TEXT_WIDTHS = 4096;

function getMeasurementContext(): MeasureContext | null {
  if (measurementContext !== undefined) return measurementContext;

  try {
    if (typeof OffscreenCanvas !== "undefined") {
      measurementContext = new OffscreenCanvas(1, 1).getContext("2d");
    } else if (typeof document !== "undefined") {
      measurementContext = document.createElement("canvas").getContext("2d");
    } else {
      measurementContext = null;
    }
  } catch {
    measurementContext = null;
  }

  return measurementContext;
}

function measureLineWidth(
  text: string,
  fontSize: number,
  fontFamily: string,
): number {
  const font = `${fontSize}px ${fontFamily}`;
  const cacheKey = `${font}\u0000${text}`;
  const cachedWidth = widthCache.get(cacheKey);
  if (cachedWidth !== undefined) return cachedWidth;

  const context = getMeasurementContext();
  let width: number;
  if (context) {
    context.font = font;
    width = context.measureText(text).width;
  } else {
    // Keep server-side and test environments deterministic when Canvas is absent.
    width = text.length * fontSize * 0.6;
  }

  if (widthCache.size >= MAX_CACHED_TEXT_WIDTHS) {
    const oldestKey = widthCache.keys().next().value;
    if (oldestKey !== undefined) widthCache.delete(oldestKey);
  }
  widthCache.set(cacheKey, width);
  return width;
}

export function measureText(
  text: string,
  fontSize = DEFAULT_TEXT_FONT_SIZE,
  fontFamily = DEFAULT_TEXT_FONT_FAMILY,
): TextMeasurement {
  const lines = text.split("\n");
  const lineHeight = fontSize * TEXT_LINE_HEIGHT;

  return {
    width: Math.max(
      0,
      ...lines.map((line) => measureLineWidth(line, fontSize, fontFamily)),
    ),
    height: Math.max(1, lines.length) * lineHeight,
    lineHeight,
  };
}
