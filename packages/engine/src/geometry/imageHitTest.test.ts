import { describe, expect, it } from "vitest";
import { createImageElement } from "../element";
import { isPointOnElement } from "./hitTest";

describe("image hit testing", () => {
  it("selects points inside the image body and rejects outside points", () => {
    const image = createImageElement({
      id: "hit-image",
      fileId: "image-file",
      x: 20,
      y: 30,
      width: 120,
      height: 80,
    });

    expect(isPointOnElement(image, { x: 80, y: 60 }, 1)).toBe(true);
    expect(isPointOnElement(image, { x: 160, y: 120 }, 1)).toBe(false);
  });
});
