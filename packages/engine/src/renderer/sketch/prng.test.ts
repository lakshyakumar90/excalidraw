import { describe, expect, it } from "vitest";
import { deriveSeed, mulberry32 } from "./prng";

describe("mulberry32", () => {
  it("matches the stable seed-one vector", () => {
    const random = mulberry32(1);
    expect(random()).toBe(0.6270739405881613);
    expect(random()).toBe(0.002735721180215478);
    expect(random()).toBe(0.5274470399599522);
  });

  it("normalizes integer seeds and derives independent streams", () => {
    expect(mulberry32(1)()).toBe(mulberry32(0x1_0000_0001)());
    expect(deriveSeed(42, 1)).not.toBe(deriveSeed(42, 2));
    expect(deriveSeed(undefined, 1)).toBe(deriveSeed(undefined, 1));
  });
});
