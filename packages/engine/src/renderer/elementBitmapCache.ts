export type ElementBitmap = CanvasImageSource & {
  width: number;
  height: number;
  close?: () => void;
};

interface Entry {
  bitmap: ElementBitmap;
  bytes: number;
}

export interface ElementBitmapCacheStats {
  entries: number;
  bytes: number;
  hits: number;
  misses: number;
  evictions: number;
}

export type BitmapCanvasFactory = (
  width: number,
  height: number,
) => HTMLCanvasElement | OffscreenCanvas;

const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;

export function createBitmapCanvas(
  width: number,
  height: number,
): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== "undefined")
    return new OffscreenCanvas(width, height);
  if (typeof document === "undefined")
    throw new Error("Canvas bitmap caching requires a browser canvas.");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Small LRU bounded by estimated RGBA bytes. */
export class ElementBitmapCache {
  private readonly entries = new Map<string, Entry>();
  private totalBytes = 0;
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(
    readonly maxBytes = DEFAULT_MAX_BYTES,
    private readonly dispose: (bitmap: ElementBitmap) => void = (bitmap) => {
      bitmap.close?.();
      try {
        (bitmap as HTMLCanvasElement).width = 0;
        (bitmap as HTMLCanvasElement).height = 0;
      } catch {
        /* Some CanvasImageSource implementations are immutable. */
      }
    },
  ) {}

  get(key: string): ElementBitmap | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      this.misses += 1;
      return undefined;
    }
    this.hits += 1;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.bitmap;
  }

  set(key: string, bitmap: ElementBitmap): boolean {
    const bytes = bitmap.width * bitmap.height * 4;
    if (!Number.isFinite(bytes) || bytes <= 0 || bytes > this.maxBytes) {
      this.dispose(bitmap);
      return false;
    }
    this.delete(key);
    while (this.totalBytes + bytes > this.maxBytes) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.delete(oldest);
      this.evictions += 1;
    }
    this.entries.set(key, { bitmap, bytes });
    this.totalBytes += bytes;
    return true;
  }

  delete(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.totalBytes -= entry.bytes;
    this.dispose(entry.bitmap);
  }

  clear(): void {
    for (const key of [...this.entries.keys()]) this.delete(key);
  }

  stats(): ElementBitmapCacheStats {
    return {
      entries: this.entries.size,
      bytes: this.totalBytes,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
    };
  }
}

export function quantizeZoom(zoom: number): number | null {
  if (!Number.isFinite(zoom) || zoom < 0.25 || zoom > 4) return null;
  return Math.pow(2, Math.round(Math.log2(zoom) * 2) / 2);
}
