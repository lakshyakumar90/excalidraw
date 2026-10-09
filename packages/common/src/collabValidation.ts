import { isLaserFrame } from "./laser.js";
import {
  SYNC_MAX_COMMIT_BYTES,
  SYNC_MAX_COMMIT_ELEMENTS,
  SYNC_MAX_ELEMENTS,
  SYNC_MAX_ID_LENGTH,
  SYNC_MAX_NONCE,
  SYNC_MAX_POINTS_PER_ELEMENT,
  SYNC_MAX_TEXT_LENGTH,
  SYNC_MAX_VERSION,
  type NormalizedElement,
  type TombstoneMap,
} from "./sync.js";
import { validateSyncBatch, validateSyncElement } from "./syncValidate.js";

import {
  SYNC_MAX_TOMBSTONE_ENTRIES,
  SYNC_MAX_SELECTION_IDS,
  SYNC_MAX_PREVIEW_ELEMENTS,
  SYNC_MAX_PREVIEW_BYTES,
  SYNC_MAX_REQUEST_ID_LENGTH,
  SYNC_MAX_MUTATION_ID_LENGTH,
  SYNC_MAX_GESTURE_ID_LENGTH,
  SYNC_MAX_REASON_LENGTH,
  type PreviewWireElement,
  type ClientToServerCollabMessage,
  type ServerToClientCollabMessage,
} from "./collabProtocol.js";
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isIdString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= SYNC_MAX_ID_LENGTH
  );
}

function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

const PREVIEW_KEYS = new Set([
  "id",
  "frameId",
  "type",
  "x",
  "y",
  "width",
  "height",
  "angle",
  "points",
  "text",
]);

function isPreviewElement(value: unknown): value is PreviewWireElement {
  if (!isRecord(value)) return false;
  for (const key of Object.keys(value)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      return false;
    }
    if (!PREVIEW_KEYS.has(key)) return false;
  }
  if (!isIdString(value.id)) return false;
  if (
    value.frameId !== undefined &&
    value.frameId !== null &&
    !isIdString(value.frameId)
  )
    return false;
  if (
    value.type !== undefined &&
    ![
      "frame",
      "rectangle",
      "ellipse",
      "diamond",
      "line",
      "arrow",
      "freedraw",
      "text",
      "image",
    ].includes(String(value.type))
  )
    return false;
  if (
    !isFiniteNumber(value.x) ||
    Math.abs(value.x) > 10_000_000 ||
    !isFiniteNumber(value.y) ||
    Math.abs(value.y) > 10_000_000
  ) {
    return false;
  }
  for (const field of ["width", "height"] as const) {
    const numeric = value[field];
    if (
      numeric !== undefined &&
      (!isFiniteNumber(numeric) || numeric < 0 || numeric > 10_000_000)
    ) {
      return false;
    }
  }
  if (value.angle !== undefined && !isFiniteNumber(value.angle)) return false;
  if (value.points !== undefined) {
    if (
      !Array.isArray(value.points) ||
      value.points.length === 0 ||
      value.points.length > SYNC_MAX_POINTS_PER_ELEMENT
    ) {
      return false;
    }
    for (const point of value.points) {
      if (
        !isRecord(point) ||
        !isFiniteNumber(point.x) ||
        !isFiniteNumber(point.y) ||
        Object.keys(point).some((key) => key !== "x" && key !== "y")
      ) {
        return false;
      }
    }
  }
  if (
    value.text !== undefined &&
    (typeof value.text !== "string" || value.text.length > SYNC_MAX_TEXT_LENGTH)
  ) {
    return false;
  }
  return true;
}

function isVersionBase(
  value: unknown,
): value is Record<string, { version: number; versionNonce: number }> {
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  if (entries.length > SYNC_MAX_COMMIT_ELEMENTS) return false;
  for (const [id, base] of entries) {
    if (!isIdString(id) || !isRecord(base)) return false;
    if (
      !isSafeInt(base.version) ||
      base.version < 1 ||
      base.version > SYNC_MAX_VERSION ||
      !isSafeInt(base.versionNonce) ||
      base.versionNonce < 0 ||
      base.versionNonce > SYNC_MAX_NONCE ||
      Object.keys(base).some(
        (key) => key !== "version" && key !== "versionNonce",
      )
    ) {
      return false;
    }
  }
  return true;
}

function isTombstoneMap(value: unknown): value is TombstoneMap {
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  if (entries.length > SYNC_MAX_TOMBSTONE_ENTRIES) return false;
  for (const [id, entry] of entries) {
    if (!isIdString(id) || !isRecord(entry)) return false;
    if (
      !isSafeInt(entry.version) ||
      !isSafeInt(entry.versionNonce) ||
      typeof entry.deletedAt !== "string" ||
      entry.deletedAt.length > 64 ||
      Object.keys(entry).some(
        (key) =>
          key !== "version" && key !== "versionNonce" && key !== "deletedAt",
      )
    ) {
      return false;
    }
  }
  return true;
}

function checkElements(
  value: unknown,
  max: number,
): value is NormalizedElement[] {
  if (!Array.isArray(value) || value.length > max) return false;
  return value.every((entry) => validateSyncElement(entry).ok);
}

export type CollabValidationResult =
  | { ok: true; message: ClientToServerCollabMessage }
  | { ok: false; error: string };

/** Validate an untrusted client collaboration payload. Never throws. */
export function validateClientCollabMessage(
  value: unknown,
): CollabValidationResult {
  if (!isRecord(value))
    return { ok: false, error: "Message must be an object" };
  if (typeof value.type !== "string")
    return { ok: false, error: "Unknown message type" };
  switch (value.type) {
    case "scene.sync.request": {
      if (
        Object.keys(value).some(
          (key) => key !== "type" && key !== "requestId",
        ) ||
        !isBoundedString(value.requestId, SYNC_MAX_REQUEST_ID_LENGTH)
      ) {
        return { ok: false, error: "Invalid sync request" };
      }
      return {
        ok: true,
        message: { type: "scene.sync.request", requestId: value.requestId },
      };
    }
    case "elements.commit": {
      if (
        Object.keys(value).some(
          (key) =>
            !["type", "mutationId", "baseRevision", "elements"].includes(key),
        )
      ) {
        return { ok: false, error: "Unexpected field in message" };
      }
      if (!isBoundedString(value.mutationId, SYNC_MAX_MUTATION_ID_LENGTH)) {
        return { ok: false, error: "Invalid mutation ID" };
      }
      if (!isSafeInt(value.baseRevision) || value.baseRevision < 0) {
        return { ok: false, error: "Invalid base revision" };
      }
      const batch = validateSyncBatch(value.elements, SYNC_MAX_COMMIT_ELEMENTS);
      if (!batch.ok) return batch;
      try {
        if (
          (JSON.stringify(value.elements)?.length ?? 0) > SYNC_MAX_COMMIT_BYTES
        ) {
          return { ok: false, error: "Commit batch too large" };
        }
      } catch {
        return { ok: false, error: "Invalid commit batch" };
      }
      return {
        ok: true,
        message: {
          type: "elements.commit",
          mutationId: value.mutationId,
          baseRevision: value.baseRevision,
          elements: batch.elements,
        },
      };
    }
    case "elements.preview": {
      if (
        Object.keys(value).some(
          (key) =>
            !["type", "gestureId", "seq", "base", "elements"].includes(key),
        )
      ) {
        return { ok: false, error: "Unexpected field in message" };
      }
      if (!isBoundedString(value.gestureId, SYNC_MAX_GESTURE_ID_LENGTH)) {
        return { ok: false, error: "Invalid gesture ID" };
      }
      if (!isSafeInt(value.seq) || value.seq < 0) {
        return { ok: false, error: "Invalid preview sequence" };
      }
      if (!isVersionBase(value.base))
        return { ok: false, error: "Invalid preview base" };
      if (
        !Array.isArray(value.elements) ||
        value.elements.length > SYNC_MAX_PREVIEW_ELEMENTS ||
        !value.elements.every(isPreviewElement)
      ) {
        return { ok: false, error: "Invalid preview geometry" };
      }
      try {
        if (
          (JSON.stringify(value.elements)?.length ?? 0) > SYNC_MAX_PREVIEW_BYTES
        ) {
          return { ok: false, error: "Preview frame too large" };
        }
      } catch {
        return { ok: false, error: "Invalid preview geometry" };
      }
      return {
        ok: true,
        message: {
          type: "elements.preview",
          gestureId: value.gestureId,
          seq: value.seq,
          base: value.base as Record<
            string,
            { version: number; versionNonce: number }
          >,
          elements: value.elements as PreviewWireElement[],
        },
      };
    }
    case "elements.preview.end": {
      if (
        Object.keys(value).some(
          (key) => key !== "type" && key !== "gestureId",
        ) ||
        !isBoundedString(value.gestureId, SYNC_MAX_GESTURE_ID_LENGTH)
      ) {
        return { ok: false, error: "Invalid preview end" };
      }
      return {
        ok: true,
        message: { type: "elements.preview.end", gestureId: value.gestureId },
      };
    }
    case "laser.move": {
      if (
        !isLaserFrame(value) ||
        Object.keys(value).some(
          (k) => !["type", "gestureId", "seq", "points"].includes(k),
        )
      )
        return { ok: false, error: "Invalid laser frame" };
      return { ok: true, message: value };
    }
    case "selection.update": {
      if (
        Object.keys(value).some(
          (key) => key !== "type" && key !== "elementIds",
        ) ||
        !Array.isArray(value.elementIds) ||
        value.elementIds.length > SYNC_MAX_SELECTION_IDS ||
        !value.elementIds.every(isIdString)
      ) {
        return { ok: false, error: "Invalid selection update" };
      }
      return {
        ok: true,
        message: {
          type: "selection.update",
          elementIds: [...value.elementIds],
        },
      };
    }
    default:
      return { ok: false, error: "Unknown message type" };
  }
}

/** Guard server collaboration payloads before the browser applies them. */
export function isServerCollabMessage(
  value: unknown,
): value is ServerToClientCollabMessage {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  switch (value.type) {
    case "laser.move":
      return (
        isLaserFrame(value) &&
        typeof value.connectionId === "string" &&
        typeof value.userId === "string"
      );
    case "scene.sync.snapshot":
      return (
        isBoundedString(value.requestId, SYNC_MAX_REQUEST_ID_LENGTH) &&
        isSafeInt(value.revision) &&
        value.revision >= 0 &&
        checkElements(value.elements, SYNC_MAX_ELEMENTS) &&
        isTombstoneMap(value.tombstones) &&
        (value.chunks === undefined ||
          (isRecord(value.chunks) &&
            isSafeInt(value.chunks.count) &&
            (value.chunks.count as number) > 0 &&
            Object.keys(value.chunks).length === 1))
      );
    case "scene.sync.chunk":
      return (
        isBoundedString(value.requestId, SYNC_MAX_REQUEST_ID_LENGTH) &&
        isSafeInt(value.index) &&
        (value.index as number) >= 0 &&
        isSafeInt(value.count) &&
        (value.count as number) > 0 &&
        (value.index as number) < (value.count as number) &&
        checkElements(value.elements, SYNC_MAX_ELEMENTS)
      );
    case "elements.pending":
      return (
        isBoundedString(value.mutationId, SYNC_MAX_MUTATION_ID_LENGTH) &&
        typeof value.connectionId === "string" &&
        typeof value.userId === "string" &&
        checkElements(value.elements, SYNC_MAX_COMMIT_ELEMENTS)
      );
    case "elements.committed":
      return (
        isBoundedString(value.mutationId, SYNC_MAX_MUTATION_ID_LENGTH) &&
        typeof value.connectionId === "string" &&
        typeof value.userId === "string" &&
        isSafeInt(value.revision) &&
        (value.revision as number) >= 0 &&
        checkElements(value.elements, SYNC_MAX_COMMIT_ELEMENTS)
      );
    case "elements.ack":
      return (
        isBoundedString(value.mutationId, SYNC_MAX_MUTATION_ID_LENGTH) &&
        (value.revision === null ||
          (isSafeInt(value.revision) && (value.revision as number) >= 0)) &&
        typeof value.saved === "boolean" &&
        (value.persisted === undefined ||
          typeof value.persisted === "boolean") &&
        (value.corrected === undefined ||
          (Array.isArray(value.corrected) &&
            value.corrected.length <= SYNC_MAX_COMMIT_ELEMENTS &&
            (value.corrected as unknown[]).every(
              (entry) => validateSyncElement(entry).ok,
            ))) &&
        (value.missingFiles === undefined ||
          (Array.isArray(value.missingFiles) &&
            (value.missingFiles as unknown[]).every(isIdString))) &&
        (value.reason === undefined ||
          (typeof value.reason === "string" &&
            value.reason.length <= SYNC_MAX_REASON_LENGTH))
      );
    case "scene.persisted":
      return isSafeInt(value.revision) && value.revision >= 0;
    case "elements.preview":
      return (
        typeof value.connectionId === "string" &&
        typeof value.userId === "string" &&
        isBoundedString(value.gestureId, SYNC_MAX_GESTURE_ID_LENGTH) &&
        isSafeInt(value.seq) &&
        (value.seq as number) >= 0 &&
        isVersionBase(value.base) &&
        Array.isArray(value.elements) &&
        (value.elements as unknown[]).length <= SYNC_MAX_PREVIEW_ELEMENTS &&
        (value.elements as unknown[]).every(isPreviewElement)
      );
    case "elements.preview.end":
      return (
        typeof value.connectionId === "string" &&
        typeof value.userId === "string" &&
        isBoundedString(value.gestureId, SYNC_MAX_GESTURE_ID_LENGTH)
      );
    case "selection.update":
      return (
        typeof value.connectionId === "string" &&
        typeof value.userId === "string" &&
        Array.isArray(value.elementIds) &&
        (value.elementIds as unknown[]).length <= SYNC_MAX_SELECTION_IDS &&
        (value.elementIds as unknown[]).every(isIdString)
      );
    default:
      return false;
  }
}

/**
 * Split elements into bounded snapshot chunks (by JSON bytes). Pure helper
 * shared by the snapshot sender and tested here.
 */
