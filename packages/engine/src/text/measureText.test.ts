import { describe, expect, it } from "vitest";
import { measureText } from "./measureText";

describe("measureText wrapping", () => {
  it("wraps words to a measured width while preserving explicit newlines", () => {
    const maxWidth = Math.max(
      measureText("one", 10).width,
      measureText("two", 10).width,
      measureText("three", 10).width,
    );
    const result = measureText("one two\nthree", 10, "sans-serif", maxWidth);

    expect(result.lines).toEqual(["one", "two", "three"]);
    expect(result.height).toBe(result.lines.length * result.lineHeight);
  });

  it("breaks an overlong word at character boundaries", () => {
    const result = measureText("abcdef", 10, "sans-serif", 12);

    expect(result.lines).toEqual(["ab", "cd", "ef"]);
  });

  it("does not wrap when no width limit is provided", () => {
    const result = measureText("one two\nthree", 10, "sans-serif");

    expect(result.lines).toEqual(["one two", "three"]);
  });
});
