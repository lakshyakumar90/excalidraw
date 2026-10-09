import { describe, expect, it } from "vitest";
import type { NormalizedElement } from "./sync.js";
import { validateSyncElement } from "./syncValidate.js";
import {
  chunkElementsForSnapshot,
  isServerCollabMessage,
  validateClientCollabMessage,
} from "./collab.js";

function rect(id: string, overrides: Record<string, unknown> = {}): NormalizedElement {
  const result = validateSyncElement({
    id,
    type: "rectangle",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    version: 2,
    versionNonce: 2,
    ...overrides,
  });
  if (!result.ok) throw new Error(`test element ${id} invalid`);
  return result.element;
}

describe("validateClientCollabMessage", () => {
  it("accepts the collaboration variants", () => {
    expect(
      validateClientCollabMessage({ type: "scene.sync.request", requestId: "r1" }),
    ).toMatchObject({ ok: true });
    expect(
      validateClientCollabMessage({
        type: "elements.commit",
        mutationId: "m1",
        baseRevision: 3,
        elements: [rect("a")],
      }),
    ).toMatchObject({ ok: true });
    expect(
      validateClientCollabMessage({
        type: "elements.preview",
        gestureId: "g1",
        seq: 4,
        base: { a: { version: 2, versionNonce: 2 } },
        elements: [{ id: "a", x: 1, y: 2, width: 5 }],
      }),
    ).toMatchObject({ ok: true });
    expect(
      validateClientCollabMessage({ type: "elements.preview.end", gestureId: "g1" }),
    ).toMatchObject({ ok: true });
    expect(
      validateClientCollabMessage({ type: "selection.update", elementIds: ["a", "b"] }),
    ).toMatchObject({ ok: true });
    expect(
      validateClientCollabMessage({ type: "selection.update", elementIds: [] }),
    ).toMatchObject({ ok: true });
  });

  it("rejects malformed, smuggled, and oversized collaboration payloads", () => {
    expect(validateClientCollabMessage({ type: "elements.commit" })).toMatchObject({
      ok: false,
    });
    // Client identity fields cannot ride along.
    expect(
      validateClientCollabMessage({
        type: "selection.update",
        elementIds: ["a"],
        userId: "mallory",
      }),
    ).toMatchObject({ ok: false });
    expect(
      validateClientCollabMessage({
        type: "elements.commit",
        mutationId: "m1",
        baseRevision: 0,
        elements: [rect("a"), rect("a")],
      }),
    ).toMatchObject({ ok: false });
    expect(
      validateClientCollabMessage({
        type: "elements.preview",
        gestureId: "g1",
        seq: 0,
        base: {},
        elements: [{ id: "a", x: 0, y: 0, version: 9 }],
      }),
    ).toMatchObject({ ok: false, error: "Invalid preview geometry" });
    expect(
      validateClientCollabMessage({
        type: "selection.update",
        elementIds: Array.from({ length: 501 }, (_, index) => `e${index}`),
      }),
    ).toMatchObject({ ok: false });
    expect(validateClientCollabMessage({ type: "elements.sync" })).toMatchObject({
      ok: false,
      error: "Unknown message type",
    });
  });
});

describe("isServerCollabMessage", () => {
  it("accepts well-formed server collaboration messages", () => {
    expect(
      isServerCollabMessage({
        type: "scene.sync.snapshot",
        requestId: "r1",
        revision: 4,
        elements: [rect("a")],
        tombstones: {},
      }),
    ).toBe(true);
    expect(
      isServerCollabMessage({
        type: "elements.ack",
        mutationId: "m1",
        revision: 5,
        saved: true,
        corrected: [rect("a", { version: 3 })],
      }),
    ).toBe(true);
    expect(
      isServerCollabMessage({
        type: "elements.ack",
        mutationId: "m1",
        revision: null,
        saved: false,
        reason: "unavailable",
      }),
    ).toBe(true);
    expect(
      isServerCollabMessage({
        type: "elements.committed",
        mutationId: "m1",
        connectionId: "c1",
        userId: "u1",
        revision: 5,
        elements: [rect("a")],
      }),
    ).toBe(true);
  });

  it("rejects malformed server collaboration payloads", () => {
    expect(isServerCollabMessage({ type: "scene.sync.snapshot" })).toBe(false);
    expect(
      isServerCollabMessage({
        type: "elements.ack",
        mutationId: "m1",
        revision: -1,
        saved: true,
      }),
    ).toBe(false);
    expect(
      isServerCollabMessage({
        type: "elements.preview",
        connectionId: "c1",
        userId: "u1",
        gestureId: "g1",
        seq: 0,
        elements: [{ id: "a", x: Number.NaN, y: 0 }],
      }),
    ).toBe(false);
  });
});

describe("chunkElementsForSnapshot", () => {
  it("keeps small scenes whole and splits large ones within budget", () => {
    const small = [rect("a"), rect("b")];
    expect(chunkElementsForSnapshot(small, 128 * 1024)).toHaveLength(1);
    const large = Array.from({ length: 50 }, (_, index) =>
      rect(`e${index}`, { text: "x".repeat(1000), type: "text", fontSize: 10, fontFamily: "f", textAlign: "left", verticalAlign: "top" }),
    );
    const chunks = chunkElementsForSnapshot(large, 4096);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flat()).toHaveLength(50);
    for (const chunk of chunks) {
      expect(JSON.stringify(chunk)?.length ?? 0).toBeLessThanOrEqual(8192);
    }
  });
});
