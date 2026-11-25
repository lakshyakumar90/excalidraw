import { afterEach, describe, expect, it } from "vitest";
import { createTextElement, measureText } from "@repo/engine";
import { scene } from "@/lib/scene/scene";
import { resizeSelectedElement } from "./selectionTransforms";

const ids: string[] = [];

function addText() {
  const element = createTextElement({
    id: `text-resize-${ids.length + 1}`,
    x: 10,
    y: 20,
    width: 200,
    height: 24,
    text: "hello world",
    fontSize: 20,
    fontFamily: "Inter",
  });
  scene.addElement(element);
  ids.push(element.id);
  return element;
}

afterEach(() => {
  for (const id of ids.splice(0)) scene.removeElement(id);
});

describe("text resize", () => {
  it("changes width without changing the font size and wraps to fit", () => {
    const element = addText();
    resizeSelectedElement(element, "e", { x: element.x + 100, y: 32 }, false, false);
    const resized = scene.getElement(element.id);
    expect(resized?.type).toBe("text");
    if (resized?.type !== "text") return;
    expect(resized.width).toBeCloseTo(100, 5);
    expect(resized.fontSize).toBe(element.fontSize);
    expect(resized.wrapText).toBe(true);
    expect(resized.height).toBeCloseTo(
      measureText(resized.text, resized.fontSize, resized.fontFamily, resized.width).height,
      5,
    );
  });

  it("scales the font with a vertical handle and keeps the box fitted", () => {
    const element = addText();
    resizeSelectedElement(element, "s", { x: 60, y: element.y + 48 }, false, false);
    const resized = scene.getElement(element.id);
    if (resized?.type !== "text") throw new Error("expected text element");
    expect(resized.fontSize).toBeCloseTo(40, 5);
    expect(resized.height).toBeCloseTo(
      measureText(resized.text, resized.fontSize, resized.fontFamily, resized.width).height,
      5,
    );
  });
});
