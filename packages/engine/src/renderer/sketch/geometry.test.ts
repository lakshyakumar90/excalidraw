import { describe, expect, it } from "vitest";
import {
  createDiamondElement,
  createEllipseElement,
  createRectangleElement,
} from "../../element/factory";
import { clearSketchGeometryCache, getSketchGeometry } from "./geometry";

describe("seeded sketch geometry", () => {
  it("repeats commands regardless of cache state and keeps outline streams independent", () => {
    const rectangle = createRectangleElement({
      id: "repeat",
      width: 100,
      height: 60,
      seed: 5,
      roughness: 2,
      fillStyle: "hachure",
    });
    const first = getSketchGeometry(rectangle);
    clearSketchGeometryCache();
    const second = getSketchGeometry(rectangle);
    expect(second).toEqual(first);

    const changedFill = getSketchGeometry({
      ...rectangle,
      fillStyle: "cross-hatch",
    });
    expect(changedFill.outlines).toEqual(first.outlines);
    expect(changedFill.hatch[1]).not.toHaveLength(0);
    expect(first.hatch[1]).toHaveLength(0);
  });

  it("uses zero jitter for Architect and two cubic passes for rough outlines", () => {
    const clean = getSketchGeometry(
      createRectangleElement({
        id: "clean",
        width: 80,
        height: 40,
        seed: 8,
        roughness: 0,
      }),
    );
    const rough = getSketchGeometry(
      createRectangleElement({
        id: "rough",
        width: 80,
        height: 40,
        seed: 8,
        roughness: 1,
      }),
    );
    expect(clean.outlines).toHaveLength(1);
    expect(clean.outlines[0]?.some((command) => command.type === "C")).toBe(
      false,
    );
    expect(rough.outlines).toHaveLength(2);
    expect(rough.outlines[0]?.some((command) => command.type === "C")).toBe(
      true,
    );
    expect(rough.outlines[0]).not.toEqual(rough.outlines[1]);
  });

  it("builds smooth closed ellipse paths for wide and tall ellipses", () => {
    for (const [width, height] of [
      [180, 35],
      [30, 150],
      [0.1, 0.1],
    ]) {
      const geometry = getSketchGeometry(
        createEllipseElement({
          id: `ellipse-${width}`,
          width,
          height,
          seed: 13,
          roughness: 2,
        }),
      );
      expect(geometry.outlines).toHaveLength(2);
      for (const path of geometry.outlines) {
        expect(path[0]?.type).toBe("M");
        expect(path.at(-1)?.type).toBe("Z");
        expect(
          path.every((command) =>
            Object.values(command).every(
              (value) => typeof value !== "number" || Number.isFinite(value),
            ),
          ),
        ).toBe(true);
      }
    }
  });

  it("clips hatch segments to rectangle, diamond and rounded boundaries", () => {
    const contains = (
      x: number,
      y: number,
      polygon: { x: number; y: number }[],
    ) => {
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i]!;
        const b = polygon[j]!;
        if (
          a.y > y !== b.y > y &&
          x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x
        )
          inside = !inside;
      }
      return inside;
    };
    const shapes = [
      createRectangleElement({
        id: "hatched-rect",
        width: 100,
        height: 70,
        seed: 9,
        roughness: 1,
        fillStyle: "hachure",
      }),
      createDiamondElement({
        id: "hatched-diamond",
        width: 100,
        height: 70,
        seed: 9,
        roughness: 1,
        fillStyle: "hachure",
      }),
      createRectangleElement({
        id: "hatched-round",
        width: 100,
        height: 70,
        seed: 9,
        roughness: 1,
        edgeStyle: "rounded",
        fillStyle: "cross-hatch",
      }),
    ];
    for (const shape of shapes) {
      const geometry = getSketchGeometry(shape);
      for (const direction of geometry.hatch) {
        for (const segment of direction) {
          const midpoint = {
            x: (segment.start.x + segment.end.x) / 2,
            y: (segment.start.y + segment.end.y) / 2,
          };
          expect(contains(midpoint.x, midpoint.y, geometry.boundary)).toBe(
            true,
          );
        }
      }
    }
    const cross = getSketchGeometry(shapes[2]!);
    expect(cross.hatch[0]).not.toHaveLength(0);
    expect(cross.hatch[1]).not.toHaveLength(0);
  });

  it("regenerates an in-progress shape when geometry changes without a version bump", () => {
    const before = createEllipseElement({
      id: "preview",
      width: 40,
      height: 40,
      seed: 2,
      roughness: 1,
    });
    const after = { ...before, width: 70, height: 55 };
    expect(getSketchGeometry(after)).not.toEqual(getSketchGeometry(before));
  });
});
