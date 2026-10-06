import { describe, expect, it } from "vitest";
import {
  createImageElement,
  createRectangleElement,
  createTextElement,
} from "../element";
import { renderSceneToSvg } from "./svgRenderer";

describe("renderSceneToSvg", () => {
  it("renders vector shapes with content bounds and optional background", () => {
    const rectangle = createRectangleElement({
      id: "svg-rectangle",
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      strokeStyle: "dashed",
      backgroundColor: "#f00",
      fillStyle: "solid",
    });

    const svg = renderSceneToSvg([rectangle], { padding: 10, background: "#fff" });
    expect(svg).toContain('width="120" height="70"');
    expect(svg).toContain("<rect x=\"0\" y=\"0\" width=\"100\" height=\"50\"");
    expect(svg).toContain('stroke-dasharray="4 2.5"');
    expect(svg).toContain('fill="#f00"');
    expect(svg).toContain('fill="#fff"');
  });

  it("escapes text and emits wrapped text lines as SVG tspans", () => {
    const text = createTextElement({
      id: "svg-text",
      x: 0,
      y: 0,
      width: 40,
      text: "<safe & sound>",
      wrapText: true,
      fontSize: 16,
    });

    const svg = renderSceneToSvg([text]);
    expect(svg).toContain("&lt;safe &amp; sound&gt;");
    expect(svg).toContain("<tspan");
    expect(svg).toContain("font-size=\"16\"");
  });

  it("emits an SVG document for the renderer supported element types", () => {
    const elements = [
      createRectangleElement({ id: "svg-one" }),
      createRectangleElement({ id: "svg-two", x: 80 }),
    ];
    const svg = renderSceneToSvg(elements);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('viewBox="0 0 ');
    expect(svg.match(/<rect/g)).toHaveLength(2);
  });

  it("exports only the elements provided for selection-only output", () => {
    const selected = createRectangleElement({ id: "selected", x: 80 });
    const svg = renderSceneToSvg([selected]);
    expect(svg.match(/<rect/g)).toHaveLength(1);
    expect(svg).not.toContain("not-selected");
  });

  it("renders an image element from its file id data URL", () => {
    const image = createImageElement({
      id: "svg-image",
      fileId: "local-image-1",
      width: 20,
      height: 10,
    });
    const svg = renderSceneToSvg([image], {
      imageFiles: new Map([["local-image-1", "data:image/png;base64,AAAA"]]),
    });
    expect(svg).toContain("<image x=\"0\" y=\"0\" width=\"20\" height=\"10\"");
    expect(svg).toContain('href="data:image/png;base64,AAAA"');
  });
});
