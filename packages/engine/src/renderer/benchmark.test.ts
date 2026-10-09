import { describe, expect, it } from "vitest";
import { createRendererStressScene } from "./benchmark";

describe("renderer stress scene", () => {
  it("creates a reproducible mixed scene with a bounded count", () => {
    const first = createRendererStressScene(5_000, 27, 100);
    const second = createRendererStressScene(5_000, 27, 100);
    expect(first).toHaveLength(5_000);
    expect(
      first.map((element) => [
        element.id,
        element.type,
        element.x,
        element.y,
        element.seed,
      ]),
    ).toEqual(
      second.map((element) => [
        element.id,
        element.type,
        element.x,
        element.y,
        element.seed,
      ]),
    );
    expect(new Set(first.map((element) => element.type))).toEqual(
      new Set(["rectangle", "ellipse", "diamond", "line", "arrow"]),
    );
    expect(createRendererStressScene(6_000)).toHaveLength(5_000);
  });
});
