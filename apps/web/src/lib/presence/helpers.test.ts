import { describe, expect, it } from "vitest";
import type { PresenceParticipant } from "@repo/common";
import { avatarEntries } from "./avatars";
import { colorForUserId, initialsForName } from "./colors";
import { stepCursorTowards } from "./interpolation";
import { computeJumpViewport } from "./viewportJump";

describe("colorForUserId", () => {
  it("is stable per user and distinct across users", () => {
    expect(colorForUserId("alice")).toBe(colorForUserId("alice"));
    expect(colorForUserId("alice")).not.toBe(colorForUserId("bob"));
    expect(colorForUserId("alice")).toMatch(/^hsl\(\d+ 70% 42%\)$/);
  });
});

describe("initialsForName", () => {
  it("derives readable initials", () => {
    expect(initialsForName("Ada Lovelace")).toBe("AL");
    expect(initialsForName("plato")).toBe("PL");
    expect(initialsForName("  ")).toBe("?");
  });
});

describe("stepCursorTowards", () => {
  it("converges without overshooting", () => {
    const start = { x: 0, y: 0 };
    const target = { x: 100, y: 50 };
    const first = stepCursorTowards(start, target, 16);
    expect(first.x).toBeGreaterThan(0);
    expect(first.x).toBeLessThan(100);
    expect(first.y).toBeGreaterThan(0);
    expect(first.y).toBeLessThan(50);
    let current = first;
    for (let frame = 0; frame < 120; frame += 1) {
      current = stepCursorTowards(current, target, 16);
    }
    expect(current.x).toBeCloseTo(100, 1);
    expect(current.y).toBeCloseTo(50, 1);
  });

  it("advances further with larger elapsed time and holds on zero elapsed", () => {
    const start = { x: 0, y: 0 };
    const target = { x: 100, y: 0 };
    expect(stepCursorTowards(start, target, 0)).toEqual(start);
    const short = stepCursorTowards(start, target, 8);
    const long = stepCursorTowards(start, target, 64);
    expect(long.x).toBeGreaterThan(short.x);
  });
});

describe("avatarEntries", () => {
  const tab = (
    connectionId: string,
    userId: string,
    viewport?: { x: number; y: number; zoom: number },
  ): PresenceParticipant => ({
    connectionId,
    userId,
    displayName: userId === "alice" ? "Alice" : "Bob",
    ...(viewport ? { viewport } : {}),
  });

  it("dedupes tabs by user and prefers a tab with a known viewport", () => {
    const entries = avatarEntries(
      [tab("c1", "alice"), tab("c2", "alice", { x: 1, y: 2, zoom: 1 })],
      "alice",
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      userId: "alice",
      displayName: "Alice (you)",
      isSelf: true,
      connectionId: "c2",
      canJump: true,
    });
  });

  it("disables jump without a shared viewport and sorts self first", () => {
    const entries = avatarEntries([tab("c1", "bob"), tab("c2", "alice")], "alice");
    expect(entries[0]?.userId).toBe("alice");
    expect(entries.find((entry) => entry.userId === "bob")?.canJump).toBe(false);
  });
});
describe("computeJumpViewport", () => {
  it("centers the shared scene point in the local canvas", () => {
    const viewport = computeJumpViewport(
      { x: 200, y: 100, zoom: 2 },
      { width: 800, height: 600 },
    );
    expect(viewport).toEqual({ scrollX: 0, scrollY: 100, zoom: 2 });
  });

  it("clamps adopted zoom to local bounds", () => {
    expect(
      computeJumpViewport({ x: 0, y: 0, zoom: 100 }, { width: 800, height: 600 }).zoom,
    ).toBeLessThanOrEqual(30);
    expect(
      computeJumpViewport({ x: 0, y: 0, zoom: 0.01 }, { width: 800, height: 600 }).zoom,
    ).toBeGreaterThanOrEqual(0.25);
  });
});
