import { describe, expect, it } from "vitest";
import { toPreviewElement } from "./previewGeometry";

describe("toPreviewElement", () => {
  it("projects committed geometry without versions or styles", () => {
    const preview = toPreviewElement({
      id: "a",
      type: "rectangle",
      x: 1,
      y: 2,
      width: 30,
      height: 40,
      angle: 15,
      strokeColor: "#ff0000",
      version: 5,
      versionNonce: 6,
    } as never);
    expect(preview).toEqual({ id: "a", type: "rectangle", x: 1, y: 2, width: 30, height: 40, angle: 15 });
  });

  it("preserves ellipse and diamond types for the live preview renderer", () => {
    for (const type of ["ellipse", "diamond"] as const) {
      expect(toPreviewElement({
        id: type, type, x: 1, y: 2, width: 30, height: 40, version: 1, versionNonce: 1,
      } as never)?.type).toBe(type);
    }
  });

  it("strips points to x/y and passes text through", () => {
    const line = toPreviewElement({
      id: "l",
      type: "freedraw",
      x: 0,
      y: 0,
      points: [
        { x: 0, y: 0, pressure: 0.5 },
        { x: 5, y: 5, pressure: 0.8 },
      ],
      version: 1,
      versionNonce: 1,
    } as never);
    expect(line?.points).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 5 },
    ]);
    const text = toPreviewElement({
      id: "t",
      type: "text",
      x: 0,
      y: 0,
      text: "hello",
      fontSize: 20,
      fontFamily: "Virgil",
      textAlign: "left",
      verticalAlign: "top",
      version: 1,
      versionNonce: 1,
    } as never);
    expect(text?.text).toBe("hello");
  });

  it("never previews deletions", () => {
    expect(
      toPreviewElement({
        id: "gone",
        type: "rectangle",
        x: 0,
        y: 0,
        isDeleted: true,
        version: 3,
        versionNonce: 1,
      } as never),
    ).toBeNull();
  });
});
