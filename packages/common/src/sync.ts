import type { Element } from "./element/index.js";

/**
 * Shared element reconciliation and ordering (Phase 15).
 *
 * Browser-safe: no DOM, no clock, no randomness, no Node/auth/database
 * imports. The browser, the HTTP server, and the WebSocket server call
 * identical logic so every replica converges.
 *
 * Rule (per element ID): missing local accepts remote; higher `version`
 * wins; equal `version` goes to higher `versionNonce`; equal
 * `(version, nonce)` with identical canonical bodies means no change; equal
 * `(version, nonce)` with different bodies resolves to the lexicographically
 * smaller canonical body so all replicas converge deterministically.
 */

export const SYNC_MAX_ELEMENTS = 5000;
export const SYNC_MAX_COMMIT_ELEMENTS = 200;
export const SYNC_MAX_COMMIT_BYTES = 256 * 1024;
export const SYNC_MAX_SNAPSHOT_BYTES = 1024 * 1024;
export const SYNC_SNAPSHOT_CHUNK_BYTES = 128 * 1024;
export const SYNC_MAX_TEXT_LENGTH = 20_000;
export const SYNC_MAX_POINTS_PER_ELEMENT = 5000;
export const SYNC_MAX_ID_LENGTH = 64;
export const SYNC_MAX_VERSION = 2_147_483_647;
export const SYNC_MAX_NONCE = 2_147_483_647;
export const SYNC_MAX_ORDER_KEY = 1e15;
export const SYNC_MIN_ORDER_STEP = 1e-9;
export const SYNC_REBALANCE_STEP = 1024;
/** Server-side tombstone body retention before a body may be pruned. */
export const SYNC_TOMBSTONE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export interface SyncTombstone {
  version: number;
  versionNonce: number;
  /** ISO-8601 server acceptance time; "" when unknown (never pruned). */
  deletedAt: string;
}

export type TombstoneMap = Record<string, SyncTombstone | undefined>;

export type NormalizedElement = Element & {
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  updated: number;
  orderKey: number;
};

export type WinnerSource = "local" | "remote" | "equal";

export interface ReconcileResult {
  merged: NormalizedElement[];
  appliedFromRemote: NormalizedElement[];
  changedIds: string[];
  tombstoneUpdates: Record<string, SyncTombstone | null>;
  rejectedIds: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeInt(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value)
  );
}

export function isValidElementId(id: unknown): id is string {
  return (
    typeof id === "string" && id.length > 0 && id.length <= SYNC_MAX_ID_LENGTH
  );
}

function cloneElement<T extends Element>(element: T): T {
  return "points" in element && Array.isArray(element.points)
    ? ({
        ...element,
        points: (element.points as unknown[]).map((point) =>
          isRecord(point) ? { ...point } : point,
        ),
      } as T)
    : { ...element };
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = sortKeysDeep(value[key]);
    }
    return out;
  }
  return value;
}

/** Canonical body used for equality and the deterministic tie-break. */
export function canonicalElement(element: Element): string {
  return JSON.stringify(sortKeysDeep(element));
}

export interface NormalizedCheck {
  id: string;
  version: number;
  versionNonce: number;
}

function readMetadata(element: Element): NormalizedCheck | null {
  if (!isRecord(element) || !isValidElementId(element.id)) return null;
  const version = element.version;
  const nonce = element.versionNonce;
  if (!isSafeInt(version) || version < 1 || version > SYNC_MAX_VERSION) {
    return null;
  }
  if (!isSafeInt(nonce) || nonce < 0 || nonce > SYNC_MAX_NONCE) {
    return null;
  }
  return { id: element.id, version, versionNonce: nonce };
}

/**
 * Normalize a record without mutating the input. Strict mode (untrusted
 * input) returns null for invalid id/version/nonce; lenient mode coerces
 * legacy/corrupt local metadata to deterministic defaults. orderKey and
 * updated are always coerced, never rejected.
 */
export function normalizeElement(
  element: Element,
  options: { strict: boolean; orderFallback: number },
): NormalizedElement | null {
  if (!isRecord(element)) return null;
  const meta = readMetadata(element);
  if (!meta) {
    if (options.strict) return null;
    if (!isValidElementId(element.id)) return null;
  }
  // Fast path: already-normalized records keep their object reference so
  // replicas can skip downstream work for unchanged elements.
  if (
    meta &&
    (element.isDeleted === true || element.isDeleted === false) &&
    (element.updated === undefined ||
      (typeof element.updated === "number" &&
        Number.isFinite(element.updated) &&
        element.updated >= 0)) &&
    (element.orderKey === undefined ||
      (typeof element.orderKey === "number" &&
        Number.isFinite(element.orderKey) &&
        Math.abs(element.orderKey) <= SYNC_MAX_ORDER_KEY))
  ) {
    const fast = element as NormalizedElement;
    if (fast.updated === undefined) {
      const copy = { ...element, updated: 0 } as NormalizedElement;
      copy.orderKey ??= options.orderFallback;
      return copy;
    }
    if (fast.orderKey === undefined) {
      return { ...element, orderKey: options.orderFallback } as NormalizedElement;
    }
    return fast;
  }
  const source = cloneElement(element);
  const normalized = source as NormalizedElement;
  normalized.version =
    meta?.version ??
    (isSafeInt(element.version) && element.version >= 1
      ? Math.min(Math.floor(element.version), SYNC_MAX_VERSION)
      : 1);
  normalized.versionNonce =
    meta?.versionNonce ??
    (isSafeInt(element.versionNonce) && element.versionNonce >= 0
      ? Math.min(Math.floor(element.versionNonce), SYNC_MAX_NONCE)
      : 0);
  normalized.isDeleted = element.isDeleted === true;
  normalized.updated =
    typeof element.updated === "number" &&
    Number.isFinite(element.updated) &&
    element.updated >= 0
      ? element.updated
      : 0;
  normalized.orderKey =
    typeof element.orderKey === "number" &&
    Number.isFinite(element.orderKey) &&
    Math.abs(element.orderKey) <= SYNC_MAX_ORDER_KEY
      ? element.orderKey
      : options.orderFallback;
  return normalized;
}

/**
 * Compare two normalized records. Returns the winner and whether the
 * bodies were already equal. Never uses arrival time, identity, or
 * `updated`.
 */
export function pickElementWinner(
  local: NormalizedElement,
  remote: NormalizedElement,
): { winner: NormalizedElement; source: WinnerSource } {
  if (remote.version !== local.version) {
    return remote.version > local.version
      ? { winner: remote, source: "remote" }
      : { winner: local, source: "local" };
  }
  if (remote.versionNonce !== local.versionNonce) {
    return remote.versionNonce > local.versionNonce
      ? { winner: remote, source: "remote" }
      : { winner: local, source: "local" };
  }
  const localBody = canonicalElement(local);
  const remoteBody = canonicalElement(remote);
  if (localBody === remoteBody) return { winner: local, source: "equal" };
  // Same (id, version, nonce), different content: deterministic canonical
  // fallback so every replica converges instead of diverging silently.
  return remoteBody < localBody
    ? { winner: remote, source: "remote" }
    : { winner: local, source: "local" };
}

function tombstoneBeats(
  tombstone: SyncTombstone,
  element: NormalizedElement,
): boolean {
  if (!isSafeInt(tombstone.version) || !isSafeInt(tombstone.versionNonce)) {
    return false;
  }
  return (
    tombstone.version > element.version ||
    (tombstone.version === element.version &&
      tombstone.versionNonce >= element.versionNonce)
  );
}

/**
 * Merge remote records into local state. Pure: never mutates inputs, linear
 * in element count via maps, idempotent on replay. Tombstones prevent stale
 * drafts from resurrecting pruned deletions.
 */
export function reconcileElements(
  local: readonly Element[],
  remote: readonly Element[],
  tombstones: TombstoneMap = {},
): ReconcileResult {
  const appliedFromRemote: NormalizedElement[] = [];
  const changedIds: string[] = [];
  const tombstoneUpdates: Record<string, SyncTombstone | null> = {};
  const rejectedIds: string[] = [];
  const localById = new Map<string, NormalizedElement>();
  const merged: NormalizedElement[] = [];

  local.forEach((element, index) => {
    const normalized = normalizeElement(element, {
      strict: false,
      orderFallback: index,
    });
    // Lenient normalization only fails on an unusable ID; duplicates keep
    // the first record deterministically.
    if (!normalized || localById.has(normalized.id)) return;
    localById.set(normalized.id, normalized);
    merged.push(normalized);
  });

  const mergedById = new Map<string, number>();
  merged.forEach((element, index) => mergedById.set(element.id, index));

  for (const incoming of remote) {
    const normalized = normalizeElement(incoming, {
      strict: true,
      orderFallback: Number.MAX_SAFE_INTEGER,
    });
    if (!normalized) {
      const id =
        isRecord(incoming) && typeof incoming.id === "string"
          ? incoming.id
          : "(unknown)";
      rejectedIds.push(id);
      continue;
    }
    const tombstone = tombstones[normalized.id];
    if (!normalized.isDeleted && tombstone && tombstoneBeats(tombstone, normalized)) {
      // Stale live replay against a known deletion: stay deleted.
      continue;
    }
    const localIndex = mergedById.get(normalized.id);
    if (localIndex === undefined) {
      mergedById.set(normalized.id, merged.length);
      merged.push(normalized);
      appliedFromRemote.push(normalized);
      changedIds.push(normalized.id);
      if (normalized.isDeleted) {
        tombstoneUpdates[normalized.id] = {
          version: normalized.version,
          versionNonce: normalized.versionNonce,
          deletedAt: tombstone?.deletedAt ?? "",
        };
      } else if (tombstone) {
        tombstoneUpdates[normalized.id] = null;
      }
      continue;
    }
    const current = merged[localIndex]!;
    const { winner, source } = pickElementWinner(current, normalized);
    if (source === "equal") continue;
    if (winner === normalized) {
      merged[localIndex] = normalized;
      appliedFromRemote.push(normalized);
      changedIds.push(normalized.id);
    }
    const accepted = winner === normalized ? normalized : current;
    if (accepted.isDeleted) {
      const prev = tombstoneUpdates[normalized.id] ?? tombstone;
      tombstoneUpdates[normalized.id] = {
        version: accepted.version,
        versionNonce: accepted.versionNonce,
        deletedAt: prev?.deletedAt ?? "",
      };
    } else if (tombstone && tombstoneUpdates[normalized.id] === undefined) {
      tombstoneUpdates[normalized.id] = null;
    }
  }

  merged.sort((a, b) =>
    a.orderKey === b.orderKey
      ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      : a.orderKey - b.orderKey,
  );
  return { merged, appliedFromRemote, changedIds, tombstoneUpdates, rejectedIds };
}

/** Fill missing/non-finite order keys from authoritative array position. */
export function assignOrderKeys<T extends Element>(elements: readonly T[]): T[] {
  return elements.map((element, index) => {
    if (
      typeof element.orderKey === "number" &&
      Number.isFinite(element.orderKey) &&
      Math.abs(element.orderKey) <= SYNC_MAX_ORDER_KEY
    ) {
      return element;
    }
    return { ...element, orderKey: index };
  });
}

/** Deterministic visible order: (orderKey, id). Returns a new array. */
export function sortElementsByOrder<T extends Element>(
  elements: readonly T[],
): T[] {
  return [...elements].sort((a, b) => {
    const ao =
      typeof a.orderKey === "number" && Number.isFinite(a.orderKey)
        ? a.orderKey
        : Number.POSITIVE_INFINITY;
    const bo =
      typeof b.orderKey === "number" && Number.isFinite(b.orderKey)
        ? b.orderKey
        : Number.POSITIVE_INFINITY;
    if (ao !== bo) return ao - bo;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Next append key: one past the current maximum (0 when empty). */
export function nextOrderKey(elements: readonly Element[]): number {
  let max = -1;
  for (const element of elements) {
    if (
      typeof element.orderKey === "number" &&
      Number.isFinite(element.orderKey) &&
      element.orderKey > max
    ) {
      max = element.orderKey;
    }
  }
  return max + 1;
}

/**
 * Fractional key between two neighbors. Returns null when the gap collapsed
 * below SYNC_MIN_ORDER_STEP so the caller rebalances instead.
 */
export function midpointOrderKey(
  before: number | null,
  after: number | null,
): number | null {
  const lo = before ?? null;
  const hi = after ?? null;
  if (lo === null && hi === null) return 0;
  if (lo === null && hi !== null) return hi - 1;
  if (lo !== null && hi === null) return lo + 1;
  const mid = (lo! + hi!) / 2;
  if (!Number.isFinite(mid) || Math.abs(hi! - lo!) < SYNC_MIN_ORDER_STEP) {
    return null;
  }
  return mid;
}

/** Renumber to SYNC_REBALANCE_STEP integers in current visible order. */
export function rebalanceOrderKeys<T extends Element>(
  elements: readonly T[],
): T[] {
  return sortElementsByOrder(elements).map((element, index) => ({
    ...element,
    orderKey: (index + 1) * SYNC_REBALANCE_STEP,
  }));
}

/**
 * Drop deleted bodies older than the retention window using server-side
 * deletion times. Tombstone entries themselves are retained by the caller.
 */
export function pruneTombstoneBodies<T extends Element>(
  elements: readonly T[],
  tombstones: TombstoneMap,
  nowMs: number,
  retentionMs: number = SYNC_TOMBSTONE_RETENTION_MS,
): { elements: T[]; prunedIds: string[] } {
  const prunedIds: string[] = [];
  const kept = elements.filter((element) => {
    if (element.isDeleted !== true) return true;
    const tombstone = tombstones[element.id];
    const deletedAt = tombstone?.deletedAt ? Date.parse(tombstone.deletedAt) : NaN;
    if (!Number.isFinite(deletedAt)) return true;
    if (nowMs - deletedAt < retentionMs) return true;
    prunedIds.push(element.id);
    return false;
  });
  return { elements: kept, prunedIds };
}
