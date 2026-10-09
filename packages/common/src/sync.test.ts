import { describe, expect, it } from "vitest";
import type { Element } from "./element/index.js";
import type { TombstoneMap } from "./sync.js";
import {
  assignOrderKeys,
  canonicalElement,
  midpointOrderKey,
  nextOrderKey,
  normalizeElement,
  pickElementWinner,
  pruneTombstoneBodies,
  rebalanceOrderKeys,
  reconcileElements,
  sortElementsByOrder,
} from "./sync.js";

function rect(
  id: string,
  overrides: Record<string, unknown> = {},
): Element {
  return {
    id,
    type: "rectangle",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    version: 1,
    versionNonce: 100,
    isDeleted: false,
    updated: 0,
    orderKey: 0,
    ...overrides,
  } as Element;
}

function normalized(id: string, overrides: Record<string, unknown> = {}) {
  const result = normalizeElement(rect(id, overrides), {
    strict: true,
    orderFallback: 0,
  });
  if (!result) throw new Error(`test element ${id} failed to normalize`);
  return result;
}

describe("normalizeElement", () => {
  it("fills deterministic legacy defaults without mutating input", () => {
    const input = rect("a", {
      version: undefined,
      versionNonce: undefined,
      isDeleted: undefined,
      updated: undefined,
      orderKey: undefined,
    });
    const snapshot = structuredClone(input);
    const result = normalizeElement(input, { strict: false, orderFallback: 7 });
    expect(input).toEqual(snapshot);
    expect(result).toMatchObject({
      version: 1,
      versionNonce: 0,
      isDeleted: false,
      updated: 0,
      orderKey: 7,
    });
  });

  it("rejects invalid identity metadata in strict mode, coerces leniently", () => {
    expect(
      normalizeElement(rect("a", { version: 0 }), { strict: true, orderFallback: 0 }),
    ).toBeNull();
    expect(
      normalizeElement(rect("a", { versionNonce: -1 }), { strict: true, orderFallback: 0 }),
    ).toBeNull();
    expect(
      normalizeElement(rect("", { version: 2 }), { strict: true, orderFallback: 0 }),
    ).toBeNull();
    expect(
      normalizeElement(rect("a", { version: 1.5 }), { strict: false, orderFallback: 0 })
        ?.version,
    ).toBe(1);
  });
});

describe("reconcileElements rule table", () => {
  const cases: {
    name: string;
    local: Element[];
    remote: Element[];
    winner: "local" | "remote";
    changed: string[];
  }[] = [
    {
      name: "unknown ID is accepted",
      local: [],
      remote: [rect("n", { version: 1, versionNonce: 5 })],
      winner: "remote",
      changed: ["n"],
    },
    {
      name: "higher version wins",
      local: [rect("a", { version: 2, versionNonce: 1, x: 1 })],
      remote: [rect("a", { version: 3, versionNonce: 1, x: 2 })],
      winner: "remote",
      changed: ["a"],
    },
    {
      name: "lower version loses",
      local: [rect("a", { version: 4, versionNonce: 1, x: 1 })],
      remote: [rect("a", { version: 3, versionNonce: 999, x: 2 })],
      winner: "local",
      changed: [],
    },
    {
      name: "equal version goes to higher nonce",
      local: [rect("a", { version: 2, versionNonce: 10, x: 1 })],
      remote: [rect("a", { version: 2, versionNonce: 11, x: 2 })],
      winner: "remote",
      changed: ["a"],
    },
    {
      name: "equal version keeps higher local nonce",
      local: [rect("a", { version: 2, versionNonce: 30, x: 1 })],
      remote: [rect("a", { version: 2, versionNonce: 11, x: 2 })],
      winner: "local",
      changed: [],
    },
    {
      name: "newer deletion beats live edit",
      local: [rect("a", { version: 2, x: 1 })],
      remote: [rect("a", { version: 3, isDeleted: true })],
      winner: "remote",
      changed: ["a"],
    },
    {
      name: "newer live edit beats older deletion",
      local: [rect("a", { version: 3, isDeleted: true })],
      remote: [rect("a", { version: 4, isDeleted: false, x: 9 })],
      winner: "remote",
      changed: ["a"],
    },
    {
      name: "older deletion loses to live edit",
      local: [rect("a", { version: 5, x: 1 })],
      remote: [rect("a", { version: 4, isDeleted: true })],
      winner: "local",
      changed: [],
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      const before = structuredClone(testCase.local);
      const remoteBefore = structuredClone(testCase.remote);
      const result = reconcileElements(testCase.local, testCase.remote);
      expect(testCase.local).toEqual(before);
      expect(testCase.remote).toEqual(remoteBefore);
      expect(result.changedIds.sort()).toEqual([...testCase.changed].sort());
      const merged = result.merged.find((element) => element.id === (testCase.changed[0] ?? testCase.local[0]?.id ?? testCase.remote[0]?.id));
      expect(merged).toBeDefined();
      if (testCase.winner === "remote") {
        expect(result.appliedFromRemote.map((element) => element.id)).toContain(
          merged!.id,
        );
      } else {
        expect(result.appliedFromRemote).toHaveLength(
          testCase.changed.length > 0 && testCase.winner === "local" ? result.appliedFromRemote.length : 0,
        );
      }
    });
  }

  it("exact replay changes nothing and preserves local references", () => {
    const local = [rect("a", { version: 2, versionNonce: 9 })];
    const result = reconcileElements(local, [structuredClone(local[0]!)]);
    expect(result.changedIds).toEqual([]);
    expect(result.appliedFromRemote).toEqual([]);
    expect(result.merged[0]).toBe(local[0]);
  });

  it("equal metadata with different bodies converges deterministically", () => {
    const left = rect("a", { version: 2, versionNonce: 9, x: 1 });
    const right = rect("a", { version: 2, versionNonce: 9, x: 2 });
    const first = reconcileElements([left], [right]);
    const second = reconcileElements([right], [left]);
    expect(canonicalElement(first.merged[0]!)).toBe(
      canonicalElement(second.merged[0]!),
    );
    // The canonically smaller body (x: 1) wins on both sides: only the side
    // holding x: 2 reports a change.
    expect(first.changedIds).toEqual([]);
    expect(second.changedIds).toEqual(["a"]);
    expect(first.merged[0]).toBe(left);
  });

  it("permutations converge: A→B then B→A reach the same state", () => {
    const a0 = [rect("a", { version: 1, versionNonce: 1, x: 1 }), rect("b", { version: 1, versionNonce: 1 })];
    const b0 = [rect("a", { version: 2, versionNonce: 1, x: 2 }), rect("c", { version: 1, versionNonce: 3 })];
    const a1 = reconcileElements(a0, b0).merged;
    const b1 = reconcileElements(b0, a0).merged;
    // Cross-converge: each side merges the other's result.
    const a2 = reconcileElements(a1, b1).merged;
    const b2 = reconcileElements(b1, a1).merged;
    expect(a2.map((element) => canonicalElement(element)).sort()).toEqual(
      b2.map((element) => canonicalElement(element)).sort(),
    );
    expect(a2.map((e) => e.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("replays are idempotent", () => {
    const local = [rect("a", { version: 1, versionNonce: 1 })];
    const remote = [rect("a", { version: 2, versionNonce: 5, x: 3 })];
    const once = reconcileElements(local, remote);
    const twice = reconcileElements(once.merged, remote);
    expect(twice.changedIds).toEqual([]);
    expect(twice.merged.map((e) => canonicalElement(e))).toEqual(
      once.merged.map((e) => canonicalElement(e)),
    );
  });

  it("duplicate IDs resolve deterministically and invalid records are reported", () => {
    const result = reconcileElements(
      [rect("a", { version: 1, x: 1 }), rect("a", { version: 5, x: 2 })],
      [
        rect("b", { version: 1 }),
        rect("b", { version: 2, x: 9 }),
        rect("bad", { version: 0 }),
        { ...rect("c"), id: "" },
      ],
    );
    // First local wins; last remote wins by version; invalid are rejected.
    expect(result.merged.find((e) => e.id === "a")?.x).toBe(1);
    expect(result.merged.find((e) => e.id === "b")?.x).toBe(9);
    expect(result.rejectedIds.sort()).toEqual(["", "bad"]);
  });
});

describe("pickElementWinner", () => {
  it("never consults updated or identity", () => {
    const local = normalized("a", { version: 2, versionNonce: 5, updated: 999 });
    const remote = normalized("a", { version: 2, versionNonce: 6, updated: 0 });
    expect(pickElementWinner(local, remote).source).toBe("remote");
    expect(pickElementWinner(remote, local).source).toBe("local");
  });
});

describe("tombstones", () => {
  it("rejects stale live replays against known deletions", () => {
    const tombstones: TombstoneMap = {
      gone: { version: 4, versionNonce: 10, deletedAt: "2026-10-01T00:00:00.000Z" },
    };
    const result = reconcileElements(
      [],
      [rect("gone", { version: 3, isDeleted: false })],
      tombstones,
    );
    expect(result.merged).toHaveLength(0);
    expect(result.changedIds).toEqual([]);
    expect(result.tombstoneUpdates).toEqual({});
  });

  it("accepts newer undeletes and clears the entry", () => {
    const tombstones: TombstoneMap = {
      back: { version: 4, versionNonce: 10, deletedAt: "2026-10-01T00:00:00.000Z" },
    };
    const result = reconcileElements(
      [],
      [rect("back", { version: 5, isDeleted: false })],
      tombstones,
    );
    expect(result.merged).toHaveLength(1);
    expect(result.tombstoneUpdates).toEqual({ back: null });
  });

  it("records new deletions while preserving existing deletion time", () => {
    const tombstones: TombstoneMap = {
      old: { version: 2, versionNonce: 3, deletedAt: "2026-09-01T00:00:00.000Z" },
    };
    const result = reconcileElements(
      [rect("old", { version: 2, isDeleted: true })],
      [
        rect("old", { version: 3, isDeleted: true }),
        rect("fresh", { version: 1, isDeleted: true }),
      ],
      tombstones,
    );
    expect(result.tombstoneUpdates["old"]).toMatchObject({
      version: 3,
      deletedAt: "2026-09-01T00:00:00.000Z",
    });
    expect(result.tombstoneUpdates["fresh"]).toMatchObject({
      version: 1,
      deletedAt: "",
    });
  });
});

describe("ordering", () => {
  it("sorts by (orderKey, id) with concurrent inserts breaking ties by ID", () => {
    const sorted = sortElementsByOrder([
      rect("b", { orderKey: 5 }),
      rect("a", { orderKey: 5 }),
      rect("c", { orderKey: 3 }),
    ]);
    expect(sorted.map((e) => e.id)).toEqual(["c", "a", "b"]);
  });

  it("assigns positional keys to legacy records", () => {
    const assigned = assignOrderKeys([
      rect("x", { orderKey: undefined }),
      rect("y", { orderKey: NaN }),
    ]);
    expect(assigned.map((e) => e.orderKey)).toEqual([0, 1]);
  });

  it("appends new keys past the maximum", () => {
    expect(nextOrderKey([])).toBe(0);
    expect(nextOrderKey([rect("a", { orderKey: 4 }), rect("b", {})])).toBe(5);
  });

  it("midpoints split neighbors and signal collapse for rebalance", () => {
    expect(midpointOrderKey(null, null)).toBe(0);
    expect(midpointOrderKey(null, 10)).toBe(9);
    expect(midpointOrderKey(10, null)).toBe(11);
    expect(midpointOrderKey(10, 20)).toBe(15);
    expect(midpointOrderKey(10, 10 + 1e-12)).toBeNull();
  });

  it("rebalances to integer steps in visible order", () => {
    const rebalanced = rebalanceOrderKeys([
      rect("b", { orderKey: 1.0000001 }),
      rect("a", { orderKey: 1.0000002 }),
    ]);
    expect(rebalanced.map((e) => [e.id, e.orderKey])).toEqual([
      ["b", 1024],
      ["a", 2048],
    ]);
  });

  it("reconcile output is always in visible order", () => {
    const result = reconcileElements(
      [rect("b", { orderKey: 2 }), rect("a", { orderKey: 1 })],
      [],
    );
    expect(result.merged.map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("pruneTombstoneBodies", () => {
  const now = Date.parse("2026-10-20T00:00:00.000Z");
  it("prunes only bodies past retention with known server times", () => {
    const tombstones: TombstoneMap = {
      old: { version: 2, versionNonce: 1, deletedAt: "2026-10-01T00:00:00.000Z" },
      young: { version: 2, versionNonce: 1, deletedAt: "2026-10-19T00:00:00.000Z" },
      unknown: { version: 2, versionNonce: 1, deletedAt: "" },
    };
    const { elements, prunedIds } = pruneTombstoneBodies(
      [
        rect("old", { isDeleted: true }),
        rect("young", { isDeleted: true }),
        rect("unknown", { isDeleted: true }),
        rect("live", {}),
      ],
      tombstones,
      now,
    );
    expect(prunedIds).toEqual(["old"]);
    expect(elements.map((e) => e.id).sort()).toEqual(["live", "unknown", "young"]);
  });
});
