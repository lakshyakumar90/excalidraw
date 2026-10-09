import { describe, expect, it } from "vitest";
import { validateSyncBatch, validateSyncElement } from "./syncValidate.js";

function rect(overrides: Record<string, unknown> = {}) {
  return {
    id: "e1",
    type: "rectangle",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    version: 1,
    versionNonce: 1,
    ...overrides,
  };
}

describe("validateSyncElement", () => {
  it("accepts a complete valid record and normalizes a clone", () => {
    const input = rect({ orderKey: 3 });
    const result = validateSyncElement(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.element).toMatchObject({ id: "e1", version: 1, orderKey: 3 });
    expect(result.element).not.toBe(input);
  });

  it("rejects unknown types, smuggled fields, and unsafe keys", () => {
    expect(validateSyncElement({ ...rect(), type: "chat" }).ok).toBe(false);
    expect(validateSyncElement({ ...rect(), elements: [] }).ok).toBe(false);
    // JSON wire input can carry __proto__ as an own key.
    const smuggled = JSON.parse(
      '{"id":"e1","type":"rectangle","x":0,"y":0,"version":1,"versionNonce":1,"__proto__":{"polluted":true}}',
    ) as unknown;
    expect(Object.keys(smuggled as object)).toContain("__proto__");
    expect(validateSyncElement(smuggled).ok).toBe(false);
    expect(validateSyncElement(null).ok).toBe(false);
  });

  it("rejects bad geometry, versions, and deletion flags", () => {
    expect(validateSyncElement(rect({ x: Number.NaN })).ok).toBe(false);
    expect(validateSyncElement(rect({ version: 0 })).ok).toBe(false);
    expect(validateSyncElement(rect({ versionNonce: -1 })).ok).toBe(false);
    expect(validateSyncElement(rect({ isDeleted: "yes" })).ok).toBe(false);
    expect(validateSyncElement(rect({ width: -2 })).ok).toBe(false);
  });

  it("validates per-type payloads", () => {
    const text = {
      id: "t1",
      type: "text",
      x: 0,
      y: 0,
      text: "hi",
      fontSize: 20,
      fontFamily: "Virgil",
      textAlign: "left",
      verticalAlign: "top",
      version: 1,
      versionNonce: 1,
    };
    expect(validateSyncElement(text).ok).toBe(true);
    expect(validateSyncElement({ ...text, text: "x".repeat(20_001) }).ok).toBe(false);
    const line = {
      id: "l1",
      type: "line",
      x: 0,
      y: 0,
      points: [{ x: 0, y: 0 }, { x: 5, y: 5 }],
      lineType: "straight",
      version: 1,
      versionNonce: 1,
    };
    expect(validateSyncElement(line).ok).toBe(true);
    expect(validateSyncElement({ ...line, points: [] }).ok).toBe(false);
    const image = {
      id: "i1",
      type: "image",
      x: 0,
      y: 0,
      fileId: "file-1",
      version: 1,
      versionNonce: 1,
    };
    expect(validateSyncElement(image).ok).toBe(true);
    expect(validateSyncElement({ ...image, fileId: "" }).ok).toBe(false);
    const arrow = {
      id: "a1",
      type: "arrow",
      x: 0,
      y: 0,
      points: [{ x: 0, y: 0 }, { x: 5, y: 5 }],
      startBinding: { elementId: "e1", focus: 0.5 },
      version: 1,
      versionNonce: 1,
    };
    expect(validateSyncElement(arrow).ok).toBe(true);
    expect(
      validateSyncElement({ ...arrow, startBinding: { elementId: "", focus: 0 } }).ok,
    ).toBe(false);
  });
});

describe("validateSyncBatch", () => {
  it("accepts bounded unique batches and rejects the rest", () => {
    expect(validateSyncBatch([rect({ id: "a" }), rect({ id: "b" })]).ok).toBe(true);
    expect(validateSyncBatch([]).ok).toBe(false);
    expect(validateSyncBatch({}).ok).toBe(false);
    expect(validateSyncBatch([rect({ id: "a" }), rect({ id: "a" })]).ok).toBe(false);
    expect(
      validateSyncBatch(
        Array.from({ length: 201 }, (_, index) => rect({ id: `e${index}` })),
      ).ok,
    ).toBe(false);
  });
});
