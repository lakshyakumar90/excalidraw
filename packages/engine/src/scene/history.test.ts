import { describe, expect, it } from "vitest";
import { createRectangleElement } from "../element";
import { Scene } from "./scene";
import { HistoryManager } from "./history";

describe("HistoryManager", () => {
  it("undoes and redoes element field changes with forward versions", () => {
    const scene = new Scene();
    const element = createRectangleElement({ id: "history-shape", x: 10 });
    scene.addElement(element);
    let selectedIds = new Set<string>([element.id]);
    const history = new HistoryManager(
      scene,
      () => selectedIds,
      (ids) => (selectedIds = new Set(ids)),
    );

    history.captureUpdate(() => scene.mutateElement(element.id, { x: 50 }));
    const afterEditVersion = element.version;

    expect(history.undo()).toBe(true);
    expect(element.x).toBe(10);
    expect(element.version).toBeGreaterThan(afterEditVersion ?? 0);
    expect(history.canRedo).toBe(true);

    const afterUndoVersion = element.version;
    expect(history.redo()).toBe(true);
    expect(element.x).toBe(50);
    expect(element.version).toBeGreaterThan(afterUndoVersion ?? 0);
  });

  it("undoes creation with a versioned tombstone and restores it on redo", () => {
    const scene = new Scene();
    const selectedIds = new Set<string>();
    const history = new HistoryManager(
      scene,
      () => selectedIds,
      (ids) => {
        selectedIds.clear();
        for (const id of ids) selectedIds.add(id);
      },
    );
    const element = createRectangleElement({ id: "new-shape" });

    history.captureUpdate(() => scene.addElement(element));
    expect(history.undo()).toBe(true);
    expect(scene.getElement(element.id)?.isDeleted).toBe(true);
    expect(history.redo()).toBe(true);
    expect(scene.getElement(element.id)?.isDeleted).toBe(false);
  });

  it("clears redo after a new action and caps history depth", () => {
    const scene = new Scene();
    const element = createRectangleElement({ id: "bounded-history" });
    scene.addElement(element);
    const history = new HistoryManager(scene, () => [], () => {}, 2);

    history.captureUpdate(() => scene.mutateElement(element.id, { x: 1 }));
    history.captureUpdate(() => scene.mutateElement(element.id, { x: 2 }));
    history.captureUpdate(() => scene.mutateElement(element.id, { x: 3 }));
    expect(history.undoDepth).toBe(2);

    history.undo();
    history.captureUpdate(() => scene.mutateElement(element.id, { x: 4 }));
    expect(history.canRedo).toBe(false);
  });

  it("ignores selection ids whose elements no longer exist", () => {
    const scene = new Scene();
    const element = createRectangleElement({ id: "selected-history" });
    scene.addElement(element);
    let selectedIds = new Set<string>([element.id]);
    const history = new HistoryManager(
      scene,
      () => selectedIds,
      (ids) => (selectedIds = new Set(ids)),
    );
    history.captureUpdate(() => {
      scene.mutateElement(element.id, { x: 10 });
      selectedIds = new Set([element.id, "missing"]);
    });
    selectedIds.clear();

    history.undo();
    expect([...selectedIds]).toEqual([element.id]);
  });

  it("filters remote changes without clearing the local redo stack", () => {
    const scene = new Scene();
    const element = createRectangleElement({ id: "remote-history" });
    scene.addElement(element);
    const history = new HistoryManager(scene, () => [], () => {});

    history.captureUpdate(() => scene.mutateElement(element.id, { x: 10 }));
    history.undo();
    expect(history.canRedo).toBe(true);

    history.captureUpdate(
      () => scene.mutateElement(element.id, { y: 25 }),
      "remote",
    );
    expect(history.undoDepth).toBe(0);
    expect(history.canRedo).toBe(true);

    history.redo();
    expect(element.x).toBe(10);
    expect(element.y).toBe(25);
  });
});
