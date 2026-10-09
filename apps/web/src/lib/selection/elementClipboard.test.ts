import { describe, expect, it } from "vitest";
import { createRectangleElement, createArrowElement } from "@repo/engine";
import type { Element } from "@repo/common";
import { duplicateElements } from "./elementClipboard";
describe("Phase 19 stamp/clipboard reference remapping", () => {
  it("remaps frames, groups and arrow bindings with fresh stacking and versions", () => {
    const f = {
      ...createRectangleElement({ id: "frame", orderKey: 100 }),
      type: "frame" as const,
    };
    const s = createRectangleElement({
      id: "shape",
      frameId: f.id,
      groupIds: ["group"],
      boundElements: ["arrow"],
      orderKey: 200,
    });
    const a = {
      ...createArrowElement({ x: 0, y: 0 }, { x: 10, y: 10 }),
      id: "arrow",
      startBinding: { elementId: s.id, focus: 0, gap: 4 },
      endBinding: { elementId: "external", focus: 0, gap: 4 },
    };
    const input: Element[] = [f, s, a];
    const clone = duplicateElements(input, 10, 20);
    const [nf, ns, na] = clone;
    expect(nf!.id).not.toBe(f.id);
    expect(ns!.frameId).toBe(nf!.id);
    expect(ns!.groupIds?.[0]).not.toBe("group");
    expect(ns!.boundElements).toEqual([na!.id]);
    expect(na!.type === "arrow" && na!.startBinding?.elementId).toBe(ns!.id);
    expect(na!.type === "arrow" && na!.endBinding).toBeUndefined();
    expect(
      clone.every((e) => e.orderKey === undefined && e.version === 1),
    ).toBe(true);
    expect(ns!.seed).toBe(s.seed);
    expect(s.x).toBe(0);
  });
});
