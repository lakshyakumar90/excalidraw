import { describe, expect, it } from "vitest";
import { getPressureWidth } from "./stroke";

describe("getPressureWidth", () => {
  it("scales width with pressure", () => {
    expect(getPressureWidth(2, 0)).toBe(1);
    expect(getPressureWidth(2, 1)).toBe(4);
    expect(getPressureWidth(2, 0)).toBeLessThan(getPressureWidth(2, 1));
  });
});
