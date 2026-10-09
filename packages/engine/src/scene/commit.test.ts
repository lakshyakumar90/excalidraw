import { describe, expect, it, vi } from "vitest";
import { createRectangleElement } from "../element";
import { Scene, type SceneCommit } from "./scene";

function rectangle(id: string, overrides: Record<string, unknown> = {}) {
  return createRectangleElement({ id, ...overrides });
}

describe("Scene.commitChanges", () => {
  it("bumps exactly one version with a fresh nonce per changed ID", () => {
    const scene = new Scene();
    const element = rectangle("commit-one", { x: 0 });
    scene.addElement(element);
    const before = element.version ?? 1;

    scene.mutateElement(element.id, { x: 10 });
    scene.mutateElement(element.id, { x: 20 });
    expect(element.version).toBe(before);

    const commits: SceneCommit[] = [];
    const unsubscribe = scene.onCommit((commit) => commits.push(commit));
    const commit = scene.commitChanges([element.id, element.id], "local");

    expect(element.version).toBe(before + 1);
    expect(typeof element.versionNonce).toBe("number");
    expect(commit.origin).toBe("local");
    expect(commit.elements).toHaveLength(1);
    expect(commit.elements[0]).not.toBe(element);
    expect(commit.elements[0]).toMatchObject({ id: element.id, x: 20 });
    expect(commits).toHaveLength(1);
    unsubscribe();
    scene.commitChanges([element.id], "local");
    expect(commits).toHaveLength(1);
  });

  it("moves past concurrently observed versions instead of forking", () => {
    const scene = new Scene();
    const element = rectangle("commit-race", { x: 0 });
    scene.addElement(element);
    scene.noteObservedVersion(element.id, 41);
    scene.commitChanges([element.id], "local");
    expect(element.version).toBe(42);
  });

  it("skips unknown IDs and emits nothing when empty", () => {
    const scene = new Scene();
    const listener = vi.fn();
    scene.onCommit(listener);
    expect(scene.commitChanges(["missing"], "local").elements).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
  });

  it("commits dependent elements changed by one action together", () => {
    const scene = new Scene();
    const shape = rectangle("shape-dep");
    const arrow = rectangle("arrow-dep");
    scene.addElement(shape);
    scene.addElement(arrow);
    const beforeShape = shape.version ?? 1;
    const beforeArrow = arrow.version ?? 1;

    scene.beginCapture();
    scene.mutateElement(shape.id, { x: 40 });
    scene.mutateElement(arrow.id, { x: 44 });
    const changes = scene.endCapture();
    const commit = scene.commitChanges(
      changes.map((change) => change.id),
      "local",
    );
    expect(commit.elements.map((element) => element.id).sort()).toEqual([
      "arrow-dep",
      "shape-dep",
    ]);
    expect(shape.version).toBe(beforeShape + 1);
    expect(arrow.version).toBe(beforeArrow + 1);
  });

  it("applies already-versioned local winners without further bumps", () => {
    const scene = new Scene();
    const element = rectangle("drag-winner", { x: 0 });
    scene.addElement(element);
    const candidate = {
      ...element,
      x: 99,
      version: (element.version ?? 1) + 1,
      versionNonce: 424242,
    };
    const commit = scene.applyLocal([candidate], "local");
    expect(scene.getElement(element.id)?.x).toBe(99);
    expect(scene.getElement(element.id)?.version).toBe(candidate.version);
    expect(commit.elements[0]).toMatchObject({ x: 99, version: candidate.version });
  });
});

describe("Scene.applyRemote", () => {
  it("applies winners with exact remote metadata and no local undo", () => {
    const scene = new Scene();
    const commits: SceneCommit[] = [];
    scene.onCommit((commit) => commits.push(commit));
    scene.addElement(rectangle("remote-one", { x: 0 }));

    const result = scene.applyRemote([
      { ...rectangle("remote-one", { x: 7 }), version: 9, versionNonce: 3, updated: 1234 },
      { ...rectangle("remote-new", { x: 1 }), version: 1, versionNonce: 1, updated: 5 },
    ]);
    expect(result.appliedIds.sort()).toEqual(["remote-new", "remote-one"]);
    const applied = scene.getElement("remote-one");
    expect(applied).toMatchObject({ x: 7, version: 9, versionNonce: 3, updated: 1234 });
    expect(commits).toEqual([]);
  });

  it("ignores stale records and reports no change", () => {
    const scene = new Scene();
    scene.addElement(rectangle("fresh", { x: 0 }));
    scene.commitChanges(["fresh"], "local");
    const current = scene.getElement("fresh")!;
    const result = scene.applyRemote([
      { ...rectangle("fresh", { x: -1 }), version: 1, versionNonce: 0, updated: 0 },
    ]);
    expect(result.appliedIds).toEqual([]);
    expect(scene.getElement("fresh")?.x).toBe(current.x);
  });

  it("rejects stale live replays against tombstones", () => {
    const scene = new Scene();
    const result = scene.applyRemote(
      [{ ...rectangle("gone", {}), version: 2, versionNonce: 1 }],
      { gone: { version: 5, versionNonce: 1, deletedAt: "2026-10-01T00:00:00.000Z" } },
    );
    expect(result.appliedIds).toEqual([]);
    expect(scene.getElement("gone")).toBeUndefined();
  });
});

describe("Scene ordering invariant", () => {
  it("keeps array order sorted by (orderKey, id) across ops", () => {
    const scene = new Scene();
    const second = rectangle("order-b", { orderKey: 20 });
    const first = rectangle("order-a", { orderKey: 10 });
    scene.addElement(second);
    scene.addElement(first);
    // Insertion order was b, a — visible order must still be a, b.
    expect(scene.getElements().map((element) => element.id)).toEqual([
      "order-a",
      "order-b",
    ]);

    scene.reorderElements(["order-a"], "front");
    expect(scene.getElements().map((element) => element.id)).toEqual([
      "order-b",
      "order-a",
    ]);

    scene.reorderElements(["order-a"], "back");
    expect(scene.getElements().map((element) => element.id)).toEqual([
      "order-a",
      "order-b",
    ]);

    scene.reorderElements(["order-a"], "forward");
    expect(scene.getElements().map((element) => element.id)).toEqual([
      "order-b",
      "order-a",
    ]);
  });

  it("assigns append keys to new elements", () => {
    const scene = new Scene();
    scene.addElement(rectangle("k1"));
    scene.addElement(rectangle("k2"));
    const keys = scene.getElements().map((element) => element.orderKey);
    expect(keys[1]).toBeGreaterThan(keys[0]!);
  });

  it("loads legacy scenes into positional order", () => {
    const scene = new Scene();
    scene.replaceAll([
      rectangle("l1", { orderKey: undefined }),
      rectangle("l2", { orderKey: undefined }),
    ]);
    expect(scene.getElements().map((element) => element.orderKey)).toEqual([0, 1]);
  });
});

describe("Scene remote isolation", () => {
  it("applies remotes during an open capture without disturbing it", () => {
    const scene = new Scene();
    scene.addElement(rectangle("local", { x: 0 }));
    scene.addElement(rectangle("remote", { x: 0 }));
    scene.beginCapture();
    scene.mutateElement("local", { x: 5 });
    const applied = scene.applyRemote([
      { ...rectangle("remote", { x: 50 }), version: 9, versionNonce: 9, updated: 7 },
    ]);
    expect(applied.appliedIds).toEqual(["remote"]);
    expect(scene.getElement("remote")).toMatchObject({
      x: 50,
      version: 9,
      versionNonce: 9,
      updated: 7,
    });
    // The local capture still yields exactly the local delta.
    const changes = scene.endCapture();
    expect(changes.map((change) => change.id)).toEqual(["local"]);
    const commit = scene.commitChanges(
      changes.map((change) => change.id),
      "local",
    );
    expect(commit.elements).toHaveLength(1);
    expect(commit.elements[0]?.id).toBe("local");
  });

  it("exposes capture base versions for preview frames", () => {
    const scene = new Scene();
    scene.addElement(rectangle("a", { x: 0 }));
    scene.commitChanges(["a"], "local");
    const committed = scene.getElement("a")!;
    scene.beginCapture();
    scene.mutateElement("a", { x: 3 });
    expect(scene.getCapturedIds()).toEqual(["a"]);
    const base = scene.getCaptureBaseVersions().get("a");
    expect(base).toEqual({
      version: committed.version,
      versionNonce: committed.versionNonce,
    });
    scene.endCapture();
  });
});
