import { describe, expect, it, vi } from "vitest";
import { PreviewStore } from "./previews";

function frame(seq: number, gesture = "g1", connection = "c1") {
  return {
    connectionId: connection,
    gestureId: gesture,
    seq,
    elements: [{ id: "a", x: seq, y: 0 }],
    receivedAt: 1000,
  };
}

describe("PreviewStore", () => {
  it("stores latest frames and ignores late/out-of-order ones", () => {
    const store = new PreviewStore();
    expect(store.setPreview(frame(1))).toBe(true);
    expect(store.setPreview(frame(3))).toBe(true);
    expect(store.setPreview(frame(2))).toBe(false);
    expect(store.setPreview(frame(3))).toBe(false);
    expect(store.getPreviews()).toHaveLength(1);
    expect(store.getPreviews()[0]?.elements[0]?.x).toBe(3);
  });

  it("tracks gestures independently per connection", () => {
    const store = new PreviewStore();
    store.setPreview(frame(1, "g1", "c1"));
    store.setPreview(frame(1, "g1", "c2"));
    expect(store.size).toBe(2);
    expect(store.clearGesture("c1", "g1")).toBe(true);
    expect(store.size).toBe(1);
    expect(store.clearConnection("c2")).toBe(true);
    expect(store.size).toBe(0);
    expect(store.clearConnection("c2")).toBe(false);
  });

  it("prunes stale gestures after the inactivity timeout", () => {
    const store = new PreviewStore();
    store.setPreview(frame(1, "g1"));
    store.setPreview({ ...frame(1, "g2"), receivedAt: 9000 });
    expect(store.pruneOlderThan(10_000, 5000)).toBe(true);
    expect(store.getPreviews().map((entry) => entry.gestureId)).toEqual(["g2"]);
    expect(store.clearAll()).toBe(true);
    expect(store.clearAll()).toBe(false);
  });

  it("notifies subscribers on changes only", () => {
    const store = new PreviewStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.setPreview(frame(1));
    store.setPreview(frame(1));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
