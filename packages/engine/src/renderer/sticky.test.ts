import { describe, expect, it } from "vitest";
import {
  createStickyElement,
  getElementAtPosition,
  getElementLocalBounds,
  STICKY_PAPER_COLOR,
  STICKY_TEXT_COLOR,
} from "../index";
import { renderSceneToSvg } from "./svgRenderer";

describe("sticky notes", () => {
  const note = createStickyElement({
    id: "note-1",
    x: 10,
    y: 20,
    text: "301s are cacheable",
    fontFamily: "Inter",
  });

  it("has resizable bounds and is hit anywhere on the note", () => {
    expect(note.width).toBe(200);
    expect(note.height).toBe(150);
    expect(getElementLocalBounds(note)).toMatchObject({
      minX: 0,
      minY: 0,
      maxX: 200,
      maxY: 150,
    });
    expect(getElementAtPosition([note], { x: 100, y: 80 }, 1)?.id).toBe(
      note.id,
    );
  });

  it("renders the paper, folded corner and text to SVG", () => {
    const svg = renderSceneToSvg([note]);
    expect(svg).toContain(STICKY_PAPER_COLOR);
    expect(svg).toContain(STICKY_TEXT_COLOR);
    expect(svg).toContain("301s are");
    expect(svg).toContain("cacheable");
  });
});
