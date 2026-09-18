import {
  describe,
  expect,
  it,
} from "vitest";

import {
  createRectangleElement,
} from "../element";

import {
  Scene,
} from "./scene";

describe("Scene", () => {
  it("starts empty", () => {
    const scene = new Scene();

    expect(scene.size).toBe(0);
    expect(scene.getElements()).toEqual([]);
  });

  it("adds an element", () => {
    const scene = new Scene();

    const element =
      createRectangleElement({
        id: "test-id1",
        type: "rectangle",
        x: 100,
        y: 100,
        width: 200,
        height: 100,
      });

    scene.addElement(element);

    expect(scene.size).toBe(1);

    expect(
      scene.getElement(element.id),
    ).toBe(element);
  });

  it("retrieves elements by id", () => {
    const scene = new Scene();

    const element =
      createRectangleElement({
        id: "test-id2",
        type: "rectangle",
        x: 10,
        y: 20,
      });

    scene.addElement(element);

    expect(
      scene.hasElement(element.id),
    ).toBe(true);

    expect(
      scene.getElement(element.id),
    ).toBe(element);
  });

  it("rejects duplicate ids", () => {
    const scene = new Scene();

    const element =
      createRectangleElement({
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

    const element =
      createRectangleElement({
        id: "test-id4",
        type: "rectangle",
        x: 10,
        y: 20,
      });

    scene.addElement(element);

    expect(
      scene.removeElement(element.id),
    ).toBe(true);

    expect(scene.size).toBe(0);

    expect(
      scene.getElement(element.id),
    ).toBeUndefined();
  });

  it("returns false when removing unknown element", () => {
    const scene = new Scene();

    expect(
      scene.removeElement("does-not-exist"),
    ).toBe(false);
  });
});