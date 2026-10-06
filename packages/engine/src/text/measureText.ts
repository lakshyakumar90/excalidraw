/** Fixed spacing shared by text measurement and canvas rendering. */
export const TEXT_LINE_HEIGHT = 1.2;
export const DEFAULT_TEXT_FONT_SIZE = 20;
export const DEFAULT_TEXT_FONT_FAMILY = "sans-serif";

export interface TextMeasurement {
  width: number;
  height: number;
  lineHeight: number;
  lines: string[];
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
  maxWidth?: number,
): TextMeasurement {
  const sourceLines = text.split(/\r\n?|\n/);
  const lines =
    maxWidth !== undefined && maxWidth > 0
      ? sourceLines.flatMap((line) =>
          wrapLine(line, maxWidth, fontSize, fontFamily),
        )
      : sourceLines;
  const lineHeight = fontSize * TEXT_LINE_HEIGHT;

  return {
    width: Math.max(
      0,
      ...lines.map((line) => measureLineWidth(line, fontSize, fontFamily)),
    ),
    height: Math.max(1, lines.length) * lineHeight,
    lineHeight,
    lines,
  };
}

function wrapLine(
  line: string,
  maxWidth: number,
  fontSize: number,
  fontFamily: string,
): string[] {
  if (line.length === 0) return [""];

  const words = line.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const wrapped: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (measureLineWidth(word, fontSize, fontFamily) > maxWidth) {
      if (currentLine) {
        wrapped.push(currentLine);
        currentLine = "";
      }
      let fragment = "";
      for (const character of Array.from(word)) {
        const candidate = fragment + character;
        if (
          fragment &&
          measureLineWidth(candidate, fontSize, fontFamily) > maxWidth
        ) {
          wrapped.push(fragment);
          fragment = character;
        } else {
          fragment = candidate;
        }
      }
      currentLine = fragment;
      continue;
    }

    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (
      currentLine &&
      measureLineWidth(candidate, fontSize, fontFamily) > maxWidth
    ) {
      wrapped.push(currentLine);
      currentLine = word;
    } else {
      currentLine = candidate;
    }
  }

  if (currentLine) wrapped.push(currentLine);
  return wrapped.length > 0 ? wrapped : [""];
}
