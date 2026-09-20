import { describe, expect, it } from "vitest";
import { normalizePressure } from "./pressure";

describe("normalizePressure", () => {
  it("clamps and defaults correctly", () => {
    expect(normalizePressure(0)).toBe(0.5);
    expect(normalizePressure(-1)).toBe(0.5);
    expect(normalizePressure(NaN)).toBe(0.5);
    expect(normalizePressure(0.5)).toBe(0.5);
    expect(normalizePressure(1)).toBe(1);
    expect(normalizePressure(2)).toBe(1);
  });
});
