import { describe, expect, it, vi } from "vitest";
import {
  ElementBitmapCache,
  quantizeZoom,
  type ElementBitmap,
} from "./elementBitmapCache";

function bitmap(width: number, height: number): ElementBitmap {
  return { width, height } as ElementBitmap;
}

describe("ElementBitmapCache", () => {
  it("tracks hits and invalidates entries when visual keys change", () => {
    const cache = new ElementBitmapCache(10_000, () => {});
    const first = bitmap(10, 10);
    cache.set("id:v1:nonce1", first);
    expect(cache.get("id:v1:nonce1")).toBe(first);
    expect(cache.get("id:v1:nonce2")).toBeUndefined();
    expect(cache.stats()).toMatchObject({ hits: 1, misses: 1, entries: 1 });
  });

  it("evicts the least recently used image and stays within its byte budget", () => {
    const dispose = vi.fn();
    const cache = new ElementBitmapCache(800, dispose);
    cache.set("old", bitmap(10, 10));
    cache.set("new", bitmap(10, 10));
    cache.get("old");
    cache.set("last", bitmap(10, 10));
    expect(cache.get("old")).toBeDefined();
    expect(cache.get("new")).toBeUndefined();
    expect(cache.stats()).toMatchObject({ bytes: 800, evictions: 1 });
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("rejects an oversized bitmap and clears resources", () => {
    const dispose = vi.fn();
    const cache = new ElementBitmapCache(300, dispose);
    expect(cache.set("too-big", bitmap(10, 10))).toBe(false);
    cache.set("small", bitmap(5, 5));
    cache.clear();
    expect(cache.stats()).toMatchObject({ entries: 0, bytes: 0 });
    expect(dispose).toHaveBeenCalledTimes(2);
  });
});

describe("quantizeZoom", () => {
  it("uses quarter-octave buckets and bypasses unsafe scales", () => {
    expect(quantizeZoom(1)).toBe(1);
    expect(quantizeZoom(1.2)).toBe(2 ** 0.5);
    expect(quantizeZoom(0.1)).toBeNull();
    expect(quantizeZoom(5)).toBeNull();
  });
});
