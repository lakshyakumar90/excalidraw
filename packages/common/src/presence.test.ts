import { describe, expect, it } from "vitest";
import {
  isServerPresenceMessage,
  validateClientPresenceMessage,
} from "./presence.js";

describe("validateClientPresenceMessage", () => {
  it("accepts pointer.move with finite scene coordinates", () => {
    expect(
      validateClientPresenceMessage({ type: "pointer.move", x: 12.5, y: -3 }),
    ).toEqual({ ok: true, message: { type: "pointer.move", x: 12.5, y: -3 } });
  });

  it("accepts viewport.update with a bounded zoom", () => {
    expect(
      validateClientPresenceMessage({ type: "viewport.update", x: 0, y: 0, zoom: 2 }),
    ).toEqual({
      ok: true,
      message: { type: "viewport.update", x: 0, y: 0, zoom: 2 },
    });
  });

  it("accepts pointer.leave", () => {
    expect(validateClientPresenceMessage({ type: "pointer.leave" })).toEqual({
      ok: true,
      message: { type: "pointer.leave" },
    });
  });

  it("rejects unknown message types", () => {
    expect(
      validateClientPresenceMessage({ type: "elements.patch", ops: [] }),
    ).toEqual({ ok: false, error: "Unknown message type" });
    expect(validateClientPresenceMessage({ type: "pong" })).toEqual({
      ok: false,
      error: "Unknown message type",
    });
    expect(validateClientPresenceMessage(null)).toEqual({
      ok: false,
      error: "Message must be an object",
    });
  });

  it("rejects non-finite, out-of-range, and non-numeric coordinates", () => {
    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      10_000_001,
      -10_000_001,
      "10",
      undefined,
    ]) {
      expect(
        validateClientPresenceMessage({ type: "pointer.move", x: bad, y: 0 }),
      ).toEqual({ ok: false, error: "Invalid pointer coordinates" });
      expect(
        validateClientPresenceMessage({ type: "viewport.update", x: 0, y: bad, zoom: 1 }),
      ).toEqual({ ok: false, error: "Invalid pointer coordinates" });
    }
  });

  it("rejects out-of-bounds zoom", () => {
    for (const zoom of [0.1, 0, 31, Number.NaN, "1"]) {
      expect(
        validateClientPresenceMessage({ type: "viewport.update", x: 0, y: 0, zoom }),
      ).toEqual({ ok: false, error: "Invalid viewport zoom" });
    }
  });

  it("rejects smuggled element/scene fields", () => {
    expect(
      validateClientPresenceMessage({
        type: "pointer.move",
        x: 1,
        y: 2,
        elements: [{ id: "a" }],
      }),
    ).toEqual({ ok: false, error: "Unexpected field in message" });
    expect(
      validateClientPresenceMessage({
        type: "viewport.update",
        x: 0,
        y: 0,
        zoom: 1,
        snapshot: {},
      }),
    ).toEqual({ ok: false, error: "Unexpected field in message" });
  });
});

describe("isServerPresenceMessage", () => {
  it("accepts well-formed server messages", () => {
    expect(
      isServerPresenceMessage({ type: "presence.snapshot", participants: [] }),
    ).toBe(true);
    expect(
      isServerPresenceMessage({
        type: "pointer.move",
        connectionId: "c1",
        userId: "u1",
        x: 1,
        y: 2,
      }),
    ).toBe(true);
    expect(isServerPresenceMessage({ type: "error", message: "slow down" })).toBe(
      true,
    );
  });

  it("rejects malformed or unknown server payloads", () => {
    expect(isServerPresenceMessage({ type: "elements.sync" })).toBe(false);
    expect(
      isServerPresenceMessage({
        type: "pointer.move",
        connectionId: "c1",
        userId: "u1",
        x: Number.NaN,
        y: 2,
      }),
    ).toBe(false);
    expect(
      isServerPresenceMessage({
        type: "presence.snapshot",
        participants: [{ connectionId: "c1" }],
      }),
    ).toBe(false);
  });
});
