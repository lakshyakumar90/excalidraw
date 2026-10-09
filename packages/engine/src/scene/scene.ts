import { projectBindings } from "../geometry/binding";
import type { Element } from "@repo/common";
import {
  assignOrderKeys,
  midpointOrderKey,
  nextOrderKey,
  normalizeElement,
  rebalanceOrderKeys,
  reconcileElements,
  sortElementsByOrder,
  type SyncTombstone,
  type TombstoneMap,
} from "@repo/common";

export interface SceneElementChange {
  id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  beforeIndex?: number;
  afterIndex?: number;
}

export type CommitOrigin = "local" | "undo" | "redo";

export interface SceneCommit {
  origin: CommitOrigin;
  /** Cloned complete records, exactly the changed IDs. */
  elements: Element[];
}

export interface RemoteApplyResult {
  appliedIds: string[];
  tombstoneUpdates: Record<string, SyncTombstone | null>;
}

interface PendingElementChange {
  before: Element | null;
  changedFields: Set<string>;
  beforeIndex?: number;
}

function cloneElement(element: Element): Element {
  return "points" in element
    ? ({
        ...element,
        points: element.points.map((point) => ({ ...point })),
      } as Element)
    : { ...element };
}

function pickFields(
  element: Element,
  fields: Iterable<string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { type: element.type };
  for (const field of fields) {
    if (field === "id" || field === "type") continue;
    const value = element[field as keyof Element];
    result[field] = Array.isArray(value) ? structuredClone(value) : value;
  }
  return result;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function freshNonce(): number {
  return Math.floor(Math.random() * 2_147_483_647);
}

function orderKeyOf(element: Element, fallback: number): number {
  return typeof element.orderKey === "number" &&
    Number.isFinite(element.orderKey)
    ? element.orderKey
    : fallback;
}

type ElementMutation<T = Element> = T extends Element
  ? Partial<Omit<T, "id" | "type">>
  : never;

export type ZOrderAction = "backward" | "forward" | "back" | "front";

export class Scene {
  private elements: Element[] = [];
  private elementMap = new Map<string, Element>();
  private sceneVersion = 0;
  private dirty = false;
  private subscribers = new Set<() => void>();
  private commitSubscribers = new Set<(commit: SceneCommit) => void>();
  private pendingChanges: Map<string, PendingElementChange> | null = null;
  /**
   * Highest version observed per ID (remote applies and local commits).
   * Local commits use max(current, observed) + 1 so a commit made right
   * after a concurrent remote edit still moves forward.
   */
  private maxObservedVersions = new Map<string, number>();

  /** Starts collecting field deltas until endCapture is called. */
  beginCapture(): void {
    if (this.pendingChanges) {
      throw new Error("A scene history capture is already active");
    }
    this.pendingChanges = new Map();
  }

  /** A capture is active (mid-gesture): autosave/outbox must defer. */
  isCapturing(): boolean {
    return this.pendingChanges !== null;
  }

  /** IDs touched by the active capture (for deferring remote geometry). */
  getCapturedIds(): string[] {
    return this.pendingChanges ? [...this.pendingChanges.keys()] : [];
  }

  /**
   * Committed (version, nonce) base for captured IDs, for preview frames.
   * Falls back to (1, 0) for elements created inside the capture.
   */
  getCaptureBaseVersions(): Map<
    string,
    { version: number; versionNonce: number }
  > {
    const base = new Map<string, { version: number; versionNonce: number }>();
    if (!this.pendingChanges) return base;
    for (const [id, change] of this.pendingChanges) {
      const before = change.before;
      base.set(id, {
        version:
          before &&
          Number.isSafeInteger(before.version) &&
          (before.version ?? 0) >= 1
            ? (before.version as number)
            : 1,
        versionNonce:
          before &&
          Number.isSafeInteger(before.versionNonce) &&
          (before.versionNonce ?? -1) >= 0
            ? (before.versionNonce as number)
            : 0,
      });
    }
    return base;
  }

  /** Returns deltas only for changed elements; it never snapshots the scene. */
  endCapture(): SceneElementChange[] {
    const pending = this.pendingChanges;
    this.pendingChanges = null;
    this.projectedVersion = -1;
    if (!pending) return [];

    const changes: SceneElementChange[] = [];
    for (const [id, change] of pending) {
      const afterElement = this.elementMap.get(id) ?? null;
      if (!change.before && !afterElement) continue;

      if (change.before && afterElement) {
        const changedFields = [...change.changedFields].filter(
          (field) =>
            !valuesEqual(
              change.before![field as keyof Element],
              afterElement[field as keyof Element],
            ),
        );
        const afterIndex = this.elements.findIndex(
          (element) => element.id === id,
        );
        const indexChanged =
          change.beforeIndex !== undefined && change.beforeIndex !== afterIndex;
        if (changedFields.length === 0 && !indexChanged) continue;
        changes.push({
          id,
          before: pickFields(change.before, changedFields),
          after: pickFields(afterElement, changedFields),
          ...(indexChanged
            ? { beforeIndex: change.beforeIndex, afterIndex }
            : {}),
        });
        continue;
      }

      changes.push({
        id,
        before: change.before ? { ...cloneElement(change.before) } : null,
        after: afterElement ? { ...cloneElement(afterElement) } : null,
      });
    }
    // Capture end always notifies so sync can flush deferred remote geometry
    // on both commit and cancel paths (commitChanges notifies again itself).
    this.notify();
    return changes;
  }

  cancelCapture(): void {
    const pending = this.pendingChanges;
    if (!pending) return;
    for (const [id, change] of pending) {
      const current = this.elementMap.get(id);
      if (!change.before) {
        this.elementMap.delete(id);
        this.elements = this.elements.filter((e) => e.id !== id);
        continue;
      }
      const restored = current ? { ...current } : cloneElement(change.before);
      for (const field of change.changedFields)
        (restored as unknown as Record<string, unknown>)[field] = (
          change.before as unknown as Record<string, unknown>
        )[field];
      this.elementMap.set(id, restored);
      const index = this.elements.findIndex((e) => e.id === id);
      if (index < 0) this.elements.push(restored);
      else this.elements[index] = restored;
    }
    this.elements = sortElementsByOrder(this.elements);
    this.pendingChanges = null;
    this.sceneVersion++;
    this.dirty = true;
    this.notify();
  }

  private recordChange(
    id: string,
    before: Element | null,
    fields: Iterable<string> = [],
  ): void {
    if (!this.pendingChanges) return;
    let change = this.pendingChanges.get(id);
    if (!change) {
      change = {
        before: before ? cloneElement(before) : null,
        changedFields: new Set(),
      };
      this.pendingChanges.set(id, change);
    }
    for (const field of fields) {
      if (field !== "id" && field !== "type") change.changedFields.add(field);
    }
  }

  addElement(element: Element): void {
    if (this.elementMap.has(element.id)) {
      throw new Error(`Element with id "${element.id}" already exists`);
    }
    this.recordChange(element.id, null);
    const stored = element as Element & {
      version?: number;
      versionNonce?: number;
      isDeleted?: boolean;
      updated?: number;
      orderKey?: number;
    };
    if (!Number.isSafeInteger(stored.version) || (stored.version ?? 0) < 1) {
      stored.version = 1;
    }
    if (
      !Number.isSafeInteger(stored.versionNonce) ||
      (stored.versionNonce ?? -1) < 0
    ) {
      stored.versionNonce = freshNonce();
    }
    if (stored.isDeleted !== true) stored.isDeleted = false;
    if (
      typeof stored.updated !== "number" ||
      !Number.isFinite(stored.updated)
    ) {
      stored.updated = Date.now();
    }
    if (
      typeof stored.orderKey !== "number" ||
      !Number.isFinite(stored.orderKey)
    ) {
      stored.orderKey = nextOrderKey(this.elements);
    }
    this.elements.push(element);
    this.elementMap.set(element.id, element);
    this.elements = sortElementsByOrder(this.elements);
    const version = stored.version ?? 1;
    const observed = this.maxObservedVersions.get(element.id) ?? 0;
    if (version > observed) this.maxObservedVersions.set(element.id, version);
    this.sceneVersion += 1;
    this.dirty = true;
    this.notify();
  }

  getElement(id: string): Element | undefined {
    return this.elementMap.get(id);
  }

  private projectedVersion = -1;
  private projected: readonly Element[] = [];
  private projectedMap = new Map<string, Element>();
  getEffectiveElement(id: string) {
    this.getRenderableElements();
    return this.projectedMap.get(id);
  }
  getRenderableElements(): readonly Element[] {
    if (this.projectedVersion !== this.sceneVersion) {
      this.projected = projectBindings(
        this.elements,
        new Set(this.getCapturedIds()),
      );
      this.projectedVersion = this.sceneVersion;
      this.projectedMap = new Map(this.projected.map((e) => [e.id, e]));
    }
    return this.projected;
  }

  getElements(): readonly Element[] {
    return this.elements;
  }

  replaceAll(elements: readonly Element[]): void {
    const replacement = assignOrderKeys(structuredClone([...elements]));
    const elementMap = new Map(
      replacement.map((element) => [element.id, element]),
    );
    if (elementMap.size !== replacement.length) {
      throw new Error("Scene elements must have unique ids");
    }
    this.elements = sortElementsByOrder(replacement);
    this.elementMap = elementMap;
    this.maxObservedVersions.clear();
    for (const element of replacement) {
      const normalized = normalizeElement(element, {
        strict: false,
        orderFallback: 0,
      });
      if (normalized)
        this.maxObservedVersions.set(element.id, normalized.version);
    }
    this.sceneVersion += 1;
    this.dirty = true;
    this.notify();
  }

  /** Reorders selected elements while keeping their relative order intact. */
  reorderElements(ids: Iterable<string>, action: ZOrderAction): boolean {
    const selectedIds = new Set(
      [...ids].filter((id) => {
        const element = this.elementMap.get(id);
        return element !== undefined && !element.isDeleted;
      }),
    );
    if (selectedIds.size === 0) return false;

    const previous = this.elements;
    const next = previous.slice();

    // Concurrent inserts can share an orderKey (ID tie-break keeps them
    // deterministic). Rebalance first so adjacent swaps change the order;
    // the caller's commit bumps the moved elements. Unmoved elements keep
    // their versions with new keys — a documented, vanishingly rare edge
    // that still converges on the next commit touching them.
    const seenKeys = new Set<number>();
    let hasDuplicateKeys = false;
    for (const element of next) {
      const key = orderKeyOf(element, 0);
      if (seenKeys.has(key)) {
        hasDuplicateKeys = true;
        break;
      }
      seenKeys.add(key);
    }
    if (hasDuplicateKeys) {
      const rebalanced = rebalanceOrderKeys(next);
      next.splice(0, next.length, ...rebalanced);
    }

    if (action === "front" || action === "back") {
      const moved = next.filter((element) => selectedIds.has(element.id));
      const remaining = next.filter((element) => !selectedIds.has(element.id));
      next.splice(
        0,
        next.length,
        ...(action === "front"
          ? [...remaining, ...moved]
          : [...moved, ...remaining]),
      );
    } else if (action === "forward") {
      // Walk from front to back so each selected element crosses at most one
      // unselected element without changing the selected elements' order.
      for (let index = next.length - 2; index >= 0; index -= 1) {
        if (
          selectedIds.has(next[index]!.id) &&
          !selectedIds.has(next[index + 1]!.id)
        ) {
          const lower = next[index]!;
          const upper = next[index + 1]!;
          const lowerKey = orderKeyOf(lower, index);
          const upperKey = orderKeyOf(upper, index + 1);
          next[index] = upper;
          next[index + 1] = lower;
          lower.orderKey = upperKey;
          upper.orderKey = lowerKey;
        }
      }
    } else {
      for (let index = 1; index < next.length; index += 1) {
        if (
          selectedIds.has(next[index]!.id) &&
          !selectedIds.has(next[index - 1]!.id)
        ) {
          const upper = next[index]!;
          const lower = next[index - 1]!;
          const upperKey = orderKeyOf(upper, index);
          const lowerKey = orderKeyOf(lower, index - 1);
          next[index - 1] = upper;
          next[index] = lower;
          lower.orderKey = upperKey;
          upper.orderKey = lowerKey;
        }
      }
    }

    if (next.every((element, index) => element.id === previous[index]?.id)) {
      return false;
    }

    if (action === "front" || action === "back") {
      const remainingKeys = next
        .filter((element) => !selectedIds.has(element.id))
        .map((element, index) => orderKeyOf(element, index));
      const bound =
        remainingKeys.length === 0
          ? -1
          : action === "front"
            ? Math.max(...remainingKeys)
            : Math.min(...remainingKeys);
      const moved = next.filter((element) => selectedIds.has(element.id));
      moved.forEach((element, offset) => {
        element.orderKey =
          action === "front"
            ? bound + 1 + offset
            : bound - (moved.length - offset);
      });
    }

    const previousIndexById = new Map(
      previous.map((element, index) => [element.id, index]),
    );
    const nextSorted = sortElementsByOrder(next);
    const nextIndexById = new Map(
      nextSorted.map((element, index) => [element.id, index]),
    );
    for (const element of previous) {
      const beforeIndex = previousIndexById.get(element.id);
      const afterIndex = nextIndexById.get(element.id);
      if (
        selectedIds.has(element.id) &&
        beforeIndex !== undefined &&
        afterIndex !== undefined &&
        beforeIndex !== afterIndex
      ) {
        this.recordChange(element.id, element);
        const pending = this.pendingChanges?.get(element.id);
        if (pending) pending.beforeIndex = beforeIndex;
      }
    }

    this.elements = nextSorted;
    this.sceneVersion += 1;
    this.dirty = true;
    this.notify();
    return true;
  }

  removeElement(id: string): boolean {
    const element = this.elementMap.get(id);

    if (!element) {
      return false;
    }
    this.recordChange(id, element);
    this.elementMap.delete(id);

    const index = this.elements.findIndex((item) => item.id === id);
    if (index !== -1) {
      this.elements.splice(index, 1);
    }

    this.sceneVersion += 1;
    this.dirty = true;
    this.notify();

    return true;
  }

  hasElement(id: string): boolean {
    return this.elementMap.has(id);
  }

  moveElementToIndex(id: string, index: number): boolean {
    const currentIndex = this.elements.findIndex(
      (element) => element.id === id,
    );
    if (currentIndex < 0) return false;
    const targetIndex = Math.max(0, Math.min(index, this.elements.length - 1));
    if (currentIndex === targetIndex) return false;
    const [element] = this.elements.splice(currentIndex, 1);
    if (!element) return false;
    this.elements.splice(targetIndex, 0, element);
    const beforeKey =
      targetIndex > 0
        ? orderKeyOf(this.elements[targetIndex - 1]!, targetIndex - 1)
        : null;
    const afterKey =
      targetIndex < this.elements.length - 1
        ? orderKeyOf(this.elements[targetIndex + 1]!, targetIndex + 1)
        : null;
    const key = midpointOrderKey(beforeKey, afterKey);
    if (key === null) {
      const rebalanced = rebalanceOrderKeys(this.elements);
      this.elements = [...rebalanced];
      this.elementMap = new Map(this.elements.map((item) => [item.id, item]));
    } else {
      element.orderKey = key;
      this.elements = sortElementsByOrder(this.elements);
    }
    this.mutateElement(id, {});
    return true;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  };

  onCommit(listener: (commit: SceneCommit) => void): () => void {
    this.commitSubscribers.add(listener);
    return () => {
      this.commitSubscribers.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.subscribers) listener();
  }

  private emitCommit(commit: SceneCommit): void {
    for (const listener of this.commitSubscribers) listener(commit);
  }

  /**
   * Transient mutation: updates content, records history, notifies, but does
   * NOT bump version/nonce/updated. Durable versions are assigned exactly
   * once by commitChanges at the action boundary.
   */
  //Partial<Element> means you can provide only the properties you want to change.
  mutateElement(id: string, changes: ElementMutation): Element | undefined {
    const element = this.elementMap.get(id);
    if (!element) return undefined;

    this.recordChange(id, element, Object.keys(changes));

    Object.assign(element, changes);
    this.sceneVersion += 1;
    this.dirty = true;
    this.notify();
    return element;
  }

  /**
   * Record an externally observed version (remote apply, snapshot merge) so
   * the next local commit moves past it instead of forking.
   */
  noteObservedVersion(id: string, version: number): void {
    if (!Number.isSafeInteger(version) || version < 0) return;
    const current = this.maxObservedVersions.get(id) ?? 0;
    if (version > current) this.maxObservedVersions.set(id, version);
  }

  /**
   * Commit exactly one durable version per ID: version becomes
   * max(current, observed) + 1 with a fresh nonce. Returns cloned complete
   * records for the wire/outbox and notifies commit subscribers. The same
   * (id, version, nonce) always identifies the same committed content.
   */
  commitChanges(ids: Iterable<string>, origin: CommitOrigin): SceneCommit {
    const seen = new Set<string>();
    const committed: Element[] = [];
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const element = this.elementMap.get(id);
      if (!element) continue;
      const current =
        typeof element.version === "number" && Number.isFinite(element.version)
          ? Math.floor(element.version)
          : 0;
      const observed = this.maxObservedVersions.get(id) ?? 0;
      element.version = Math.max(current, observed, 1) + 1;
      element.versionNonce = freshNonce();
      element.updated = Date.now();
      this.maxObservedVersions.set(id, element.version);
      committed.push(cloneElement(element));
    }
    if (committed.length > 0) {
      this.sceneVersion += 1;
      this.dirty = true;
      this.notify();
      this.emitCommit({ origin, elements: committed });
    }
    return { origin, elements: committed };
  }

  /**
   * Set exact local records (already-versioned merge winners, e.g. a drag
   * commit reconciled against deferred remote state) and emit one commit
   * event without further bumps.
   */
  applyLocal(records: readonly Element[], origin: CommitOrigin): SceneCommit {
    const applied: Element[] = [];
    for (const record of records) {
      const current = this.elementMap.get(record.id);
      if (!current) continue;
      const index = this.elements.findIndex((item) => item.id === record.id);
      const replacement = cloneElement(record);
      this.elements[index] = replacement;
      this.elementMap.set(record.id, replacement);
      if (Number.isSafeInteger(record.version)) {
        this.noteObservedVersion(record.id, record.version as number);
      }
      applied.push(cloneElement(replacement));
    }
    if (applied.length > 0) {
      this.elements = sortElementsByOrder(this.elements);
      this.sceneVersion += 1;
      this.dirty = true;
      this.notify();
      this.emitCommit({ origin, elements: applied });
    }
    return { origin, elements: applied };
  }

  /**
   * Apply authoritative remote records: reconcile by (version, nonce),
   * preserve exact remote metadata, redraw and persist the draft, but never
   * rebroadcast, bump, or create undo steps.
   */
  applyRemote(
    records: readonly Element[],
    tombstones: TombstoneMap = {},
  ): RemoteApplyResult {
    const result = reconcileElements(this.elements, records, tombstones);
    if (
      result.changedIds.length === 0 &&
      Object.keys(result.tombstoneUpdates).length === 0
    ) {
      return { appliedIds: [], tombstoneUpdates: {} };
    }
    this.elements = [...result.merged];
    this.elementMap = new Map(this.elements.map((item) => [item.id, item]));
    for (const applied of result.appliedFromRemote) {
      this.noteObservedVersion(applied.id, applied.version);
    }
    this.sceneVersion += 1;
    this.dirty = true;
    this.notify();
    return {
      appliedIds: result.appliedFromRemote.map((item) => item.id),
      tombstoneUpdates: result.tombstoneUpdates,
    };
  }

  get version(): number {
    return this.sceneVersion;
  }

  get isDirty(): boolean {
    return this.dirty;
  }

  get size(): number {
    return this.elements.length;
  }

  getSnapshot = (): number => {
    return this.sceneVersion;
  };

  markClean(): void {
    this.dirty = false;
  }
}
