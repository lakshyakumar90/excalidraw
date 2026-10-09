import { describe, expect, it } from "vitest";
import { easeFollowViewport } from "./follow";
describe("follow viewport easing", () => {
  const current = { zoom: 1, scrollX: 0, scrollY: 0 },
    target = { zoom: 2, scrollX: 100, scrollY: 50 };
  it("is smooth and frame-rate independent", () => {
    const first = easeFollowViewport(current, target, 16),
      second = easeFollowViewport(first, target, 16),
      single = easeFollowViewport(current, target, 32);
    expect(first.scrollX).toBeGreaterThan(0);
    expect(first.scrollX).toBeLessThan(100);
    expect(second.scrollX).toBeCloseTo(single.scrollX);
    expect(current.scrollX).toBe(0);
  });
  it("honors reduced motion and clamps stalled/negative frames", () => {
    expect(easeFollowViewport(current, target, 16, true)).toEqual(target);
    expect(easeFollowViewport(current, target, -1)).toEqual(current);
    expect(easeFollowViewport(current, target, 10000)).toEqual(
      easeFollowViewport(current, target, 100),
    );
  });
});
