import { describe, expect, it } from "vitest";
import type { Element, FrameElement } from "@repo/common";
import { createRectangleElement, createArrowElement } from "../element";
import {
  findBindingShape,
  getArrowBindingPoint,
  projectBindings,
} from "../geometry/binding";
import { getElementsAtPosition } from "../geometry/hitTest";
import {
  frameForElement,
  framePaintOrder,
  layoutDeltas,
  selectionClosure,
  SnapIndex,
  visibleBounds,
} from "./layout";
import { touchViewport } from "../viewport/touch";
import { Scene } from "./scene";
import { HistoryManager } from "./history";
import { renderSceneToSvg } from "../renderer/svgRenderer";

const rect = (id: string, x = 0, y = 0, width = 100, height = 100) =>
  createRectangleElement({ id, x, y, width, height, roughness: 0 });
const frame = (): FrameElement => ({
  ...rect("frame"),
  type: "frame",
  name: "<Frame>",
});

describe("Phase 19 geometry and gesture invariants", () => {
  it.each(["rectangle", "ellipse", "diamond"] as const)(
    "projects %s bindings with a border gap",
    (type) => {
      const shape = { ...rect("shape"), type };
      expect(
        getArrowBindingPoint(shape, {
          elementId: shape.id,
          focus: 0,
          gap: 4,
          fixedPoint: [1, 0.5],
        }),
      ).toEqual({ x: 104, y: 50 });
      expect(
        getArrowBindingPoint(
          { ...shape, angle: Math.PI / 2 },
          { elementId: shape.id, focus: 0, gap: 4, fixedPoint: [1, 0.5] },
        ).y,
      ).toBeCloseTo(104);
    },
  );
  it("acquires bindings in CSS pixels, resolves paint ties, ignores deleted shapes", () => {
    const a = rect("a"),
      b = rect("b");
    expect(findBindingShape([a, b], { x: 111, y: 50 }, 1)?.id).toBe("b");
    expect(findBindingShape([a, b], { x: 111, y: 50 }, 2)).toBeUndefined();
    expect(findBindingShape([a],{x:50,y:50},1)?.id).toBe("a");
    expect(
      findBindingShape([a, { ...b, isDeleted: true }], { x: 100, y: 50 }, 1)
        ?.id,
    ).toBe("a");
  });
  it("projects remote shape movement without changing arrow versions or stored geometry", () => {
    const shape = rect("shape");
    const arrow = {
      ...createArrowElement({ x: 104, y: 50 }, { x: 200, y: 50 }),
      startBinding: {
        elementId: shape.id,
        focus: 0,
        gap: 4,
        fixedPoint: [1, 0.5] as [number, number],
      },
    };
    const original = structuredClone(arrow);
    const projected = projectBindings([arrow, { ...shape, x: 20 }])[0]!;
    expect(
      projected.type === "arrow" && projected.x + projected.points[0]!.x,
    ).toBeCloseTo(124);
    expect(projected.version).toBe(arrow.version);
    expect(arrow).toEqual(original);
    expect(projectBindings([arrow])[0]).toBe(arrow);
    expect(projectBindings([arrow, { ...shape, isDeleted: true }])[0]).toBe(
      arrow,
    );
  });
  it("reattaches effective geometry when an out-of-order target arrives", () => {
    const scene = new Scene();
    const arrow = {
      ...createArrowElement({ x: 0, y: 0 }, { x: 200, y: 0 }),
      startBinding: {
        elementId: "shape",
        focus: 0,
        gap: 4,
        fixedPoint: [1, 0.5] as [number, number],
      },
    };
    scene.addElement(arrow);
    const before = scene.getRenderableElements()[0];
    scene.addElement(rect("shape"));
    expect(scene.getRenderableElements()[0]).not.toBe(before);
    expect(scene.getElement(arrow.id)).toBe(arrow);
  });
  it("clips children for hit testing, search bounds and SVG", () => {
    const f = frame(),
      child = { ...rect("child", 90, 20, 50, 20), frameId: f.id };
    expect(visibleBounds(child, [f, child])).toEqual({
      minX: 90,
      minY: 20,
      maxX: 100,
      maxY: 40,
    });
    expect(
      getElementsAtPosition([f, child], { x: 125, y: 30 }, 1).some(
        (e) => e.id === child.id,
      ),
    ).toBe(false);
    expect(getElementsAtPosition([f, child], { x: 95, y: 30 }, 1)[0]?.id).toBe(
      child.id,
    );
    const svg = renderSceneToSvg([f, child]);
    expect(svg).toContain("clipPath");
    expect(svg).toContain("&lt;Frame&gt;");
    expect(visibleBounds({ ...child, x: 150 }, [f, child])).toBeNull();
  });
  it("detaches missing parents and selects frame descendants once", () => {
    const f = frame(),
      child = { ...rect("child", 10, 10), frameId: f.id };
    expect(visibleBounds(child, [child])).not.toBeNull();
    expect(
      selectionClosure([f, child], [f.id, child.id]).map((e) => e.id),
    ).toEqual([f.id, child.id]);
    expect(frameForElement({ ...child, width: 20, height: 20 }, [f])).toBe(
      f.id,
    );
    expect(frameForElement(f, [f])).toBeNull();
  });
  it("paints children inside their container stacking slot", () => {
    const f = frame(),
      child = { ...rect("child"), frameId: f.id },
      other = rect("other");
    expect(framePaintOrder([f, other, child]).map((e) => e.id)).toEqual([
      f.id,
      child.id,
      other.id,
    ]);
  });
  it.each(["left", "center", "right", "top", "middle", "bottom"] as const)(
    "aligns %s without changing size",
    (action) => {
      const input = [rect("a", 0, 0, 20, 20), rect("b", 60, 70, 10, 10)];
      const before = structuredClone(input);
      const deltas = layoutDeltas(input, action);
      expect(deltas.size).toBeGreaterThan(0);
      expect(input).toEqual(before);
    },
  );
  it("distributes unequal widths by equal gaps and preserves extremes", () => {
    const deltas = layoutDeltas(
      [rect("a", 0, 0, 10), rect("b", 20, 0, 20), rect("c", 100, 0, 30)],
      "horizontal",
    );
    expect(deltas.get("b")?.x).toBe(25);
    expect(deltas.has("a")).toBe(false);
    expect(deltas.has("c")).toBe(false);
  });
  it("treats groups and frames as units, skips no-op/single-unit layout", () => {
    const a = { ...rect("a"), groupIds: ["g"] },
      b = { ...rect("b", 30), groupIds: ["g"] };
    expect(layoutDeltas([a, b], "left").size).toBe(0);
    const f = frame(),
      child = { ...rect("child"), frameId: f.id };
    expect(layoutDeltas([f, child], "left").size).toBe(0);
  });
  it("snaps axes independently at screen-relative tolerance and excludes moved/deleted elements", () => {
    const index = new SnapIndex(
      [
        rect("target", 100, 200, 20, 20),
        rect("excluded", 105, 207),
        { ...rect("deleted", 104, 205), isDeleted: true },
      ],
      new Set(["excluded"]),
    );
    expect(index.snap({ minX: 96, maxX: 96, minY: 197, maxY: 197 }, 1)).toEqual(
      {
        delta: { x: 4, y: 3 },
        guides: [
          { axis: "x", position: 100 },
          { axis: "y", position: 200 },
        ],
      },
    );
    const fresh = new SnapIndex([rect("target", 100, 200, 20, 20)], new Set());
    expect(
      fresh.snap({ minX: 96, maxX: 96, minY: 197, maxY: 197 }, 2).delta.x,
    ).toBe(0);
  });
  it("anchors pinch zoom at the initial midpoint and pans with two fingers", () => {
    const result = touchViewport(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      [
        { x: 0, y: 10 },
        { x: 200, y: 10 },
      ],
      { zoom: 1, scrollX: 0, scrollY: 0 },
    );
    expect(result).toEqual({ zoom: 2, scrollX: 0, scrollY: 10 });
    expect(touchViewport([], [], result)).toBe(result);
  });
  it("cancels provisional creation/movement without history or durable commits", () => {
    const scene = new Scene();
    scene.addElement(rect("a"));
    const history = new HistoryManager(
      scene,
      () => ["a"],
      () => {},
    );
    let commits = 0;
    scene.onCommit(() => commits++);
    history.startCapture();
    scene.mutateElement("a", { x: 50 });
    scene.addElement(rect("new"));
    history.cancelCapture();
    expect(scene.getElement("a")?.x).toBe(0);
    expect(scene.getElement("new")).toBeUndefined();
    expect(history.canUndo).toBe(false);
    expect(commits).toBe(0);
    expect(scene.isCapturing()).toBe(false);
  });
});
