import { describe, expect, it } from "vitest";

import { createRectangleElement } from "../element";

import { Scene } from "./scene";

describe("Scene", () => {
  it("starts empty", () => {
    const scene = new Scene();

    expect(scene.size).toBe(0);
    expect(scene.getElements()).toEqual([]);
  });

  it("adds an element", () => {
    const scene = new Scene();

    const element = createRectangleElement({
      id: "test-id1",
      type: "rectangle",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    });

    scene.addElement(element);

    expect(scene.size).toBe(1);

    expect(scene.getElement(element.id)).toBe(element);
  });

  it("retrieves elements by id", () => {
    const scene = new Scene();

    const element = createRectangleElement({
      id: "test-id2",
      type: "rectangle",
      x: 10,
      y: 20,
    });

    scene.addElement(element);

    expect(scene.hasElement(element.id)).toBe(true);

    expect(scene.getElement(element.id)).toBe(element);
  });

  it("rejects duplicate ids", () => {
    const scene = new Scene();

    const element = createRectangleElement({
      id: "test-id3",
      type: "rectangle",
      x: 10,
      y: 20,
    });

    scene.addElement(element);

    expect(() => {
      scene.addElement(element);
    }).toThrow();
  });

  it("removes an element", () => {
    const scene = new Scene();

    const element = createRectangleElement({
      id: "test-id4",
      type: "rectangle",
      x: 10,
      y: 20,
    });

    scene.addElement(element);

    expect(scene.removeElement(element.id)).toBe(true);

    expect(scene.size).toBe(0);

    expect(scene.getElement(element.id)).toBeUndefined();
  });

  it("returns false when removing unknown element", () => {
    const scene = new Scene();

    expect(scene.removeElement("does-not-exist")).toBe(false);
  });

  it("mutates an element", () => {
    const scene = new Scene();

    const element = createRectangleElement({
      id: "test-id5",
      type: "rectangle",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    });

    scene.addElement(element);

    const initialVersion = element.version ?? 1;

    const sceneVersion = scene.version;

    const result = scene.mutateElement(element.id, {
      x: 500,
      width: 400,
    });

    expect(result).toBe(element);

    expect(element.x).toBe(500);

    expect(element.width).toBe(400);

    expect(element.y).toBe(100);

    expect(element.version).toBe(initialVersion + 1);

    expect(scene.version).toBe(sceneVersion + 1);

    expect(scene.isDirty).toBe(true);
  });

  it("returns undefined when mutating an unknown element", () => {
    const scene = new Scene();

    const result = scene.mutateElement("does-not-exist", {
      x: 100,
    });

    expect(result).toBeUndefined();

    expect(scene.version).toBe(0);

    expect(scene.isDirty).toBe(false);
  });

  it("notifies subscribers when the scene changes", () => {
    const scene = new Scene();

    let notificationCount = 0;

    const unsubscribe = scene.subscribe(() => {
      notificationCount += 1;
    });

    const element = createRectangleElement({
      id: "test-id6",
      type: "rectangle",
      x: 0,
      y: 0,
    });

    scene.addElement(element);

    scene.mutateElement(element.id, {
      x: 100,
    });

    scene.removeElement(element.id);

    expect(notificationCount).toBe(3);

    unsubscribe();

    scene.addElement(
      createRectangleElement({
        id: "test-id7",
        type: "rectangle",
        x: 50,
        y: 50,
      }),
    );

    expect(notificationCount).toBe(3);
  });

  it("can mark the scene clean", () => {
    const scene = new Scene();

    const element = createRectangleElement({
      id: "test-id8",
      type: "rectangle",
      x: 0,
      y: 0,
    });

    scene.addElement(element);

    expect(scene.isDirty).toBe(true);

    scene.markClean();

    expect(scene.isDirty).toBe(false);
  });

  it("increments its snapshot version when the scene changes", () => {
    const scene = new Scene();

    expect(scene.getSnapshot()).toBe(0);

    const element = createRectangleElement({
      x: 0,
      y: 0,
    });

    scene.addElement(element);

    expect(scene.getSnapshot()).toBe(1);

    scene.mutateElement(element.id, {
      x: 100,
    });

    expect(scene.getSnapshot()).toBe(2);

    scene.removeElement(element.id);

    expect(scene.getSnapshot()).toBe(3);
  });

  it("captures only changed fields for each touched element", () => {
    const scene = new Scene();
    const rectangle = createRectangleElement({
      id: "history-rect",
      x: 10,
      y: 20,
      width: 80,
      height: 40,
    });
    const untouched = createRectangleElement({ id: "untouched" });
    scene.addElement(rectangle);
    scene.addElement(untouched);

    scene.beginCapture();
    scene.mutateElement(rectangle.id, { x: 30 });
    scene.mutateElement(rectangle.id, { x: 50, width: 100 });
    const changes = scene.endCapture();

    expect(changes).toEqual([
      {
        id: rectangle.id,
        before: { type: "rectangle", x: 10, width: 80 },
        after: { type: "rectangle", x: 50, width: 100 },
      },
    ]);
  });

  it("captures element creation and removal as per-element deltas", () => {
    const scene = new Scene();
    const created = createRectangleElement({ id: "created" });

    scene.beginCapture();
    scene.addElement(created);
    const creation = scene.endCapture();
    expect(creation).toHaveLength(1);
    expect(creation[0]).toMatchObject({ id: created.id, before: null });
    expect(creation[0]?.after).toMatchObject({
      type: "rectangle",
      x: created.x,
      y: created.y,
    });

    scene.beginCapture();
    scene.removeElement(created.id);
    const removal = scene.endCapture();
    expect(removal).toHaveLength(1);
    expect(removal[0]).toMatchObject({ id: created.id, after: null });
    expect(removal[0]?.before).toMatchObject({ type: "rectangle" });
  });

  it("drops mutations that return to their original value", () => {
    const scene = new Scene();
    const rectangle = createRectangleElement({ id: "no-op", x: 10 });
    scene.addElement(rectangle);

    scene.beginCapture();
    scene.mutateElement(rectangle.id, { x: 20 });
    scene.mutateElement(rectangle.id, { x: 10 });

    expect(scene.endCapture()).toEqual([]);
  });
});
