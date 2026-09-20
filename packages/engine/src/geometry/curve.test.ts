import { describe, expect, it } from "vitest";
import { getCatmullRomPoint, sampleCatmullRom } from "./curve";

describe("getCatmullRomPoint", () => {
  it("returns a point between control points", () => {
    const result = getCatmullRomPoint(
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 20 },
      { x: 30, y: 30 },
      0,
    );
    expect(result.x).toBeCloseTo(10);
    expect(result.y).toBeCloseTo(10);
  });
});

describe("sampleCatmullRom", () => {
  it("returns the original endpoints", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 50, y: 100 },
      { x: 100, y: 0 },
    ];
    const result = sampleCatmullRom(points);
    expect(result[0]).toEqual(points[0]);
    expect(result[result.length - 1]).toEqual(points[2]);
  });

  it("handles two points", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ];
    expect(sampleCatmullRom(points)).toEqual(points);
  });
});
