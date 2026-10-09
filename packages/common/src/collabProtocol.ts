import { type LaserFrame, type RemoteLaserFrame } from "./laser.js";
import { type NormalizedElement, type TombstoneMap } from "./sync.js";

/**
 * Versioned collaboration protocol (Phase 15).
 *
 * Extends the Phase 14 presence channel on the SAME room connection — no
 * second socket. Presence variants are retained untouched; the validators
 * below add explicitly typed element messages. Identity and room always come
 * from the authenticated connection; client-supplied user/connection/room
 * fields cannot authorize or spoof another participant.
 */

/** Negotiated when both sides support element sync. */
export const COLLAB_WS_PROTOCOL = "excalidraw-collab.v1";

export const SYNC_MAX_TOMBSTONE_ENTRIES = 10_000;
export const SYNC_MAX_SELECTION_IDS = 500;
export const SYNC_MAX_PREVIEW_ELEMENTS = 200;
export const SYNC_MAX_PREVIEW_BYTES = 64 * 1024;
export const SYNC_MAX_REQUEST_ID_LENGTH = 64;
export const SYNC_MAX_MUTATION_ID_LENGTH = 128;
export const SYNC_MAX_GESTURE_ID_LENGTH = 64;
export const SYNC_MAX_REASON_LENGTH = 200;
/** Ephemeral budget shared by cursor/preview/selection frames. */
export const WS_EPHEMERAL_RATE_PER_SECOND = 90;
/** Committed traffic (commits, sync requests) budget per connection. */
export const WS_COMMIT_RATE_PER_SECOND = 20;
/** Larger frames for scenes; snapshots chunk beyond this. */
export const WS_COLLAB_MAX_PAYLOAD_BYTES = 256 * 1024;

export interface PreviewWireElement {
  id: string;
  frameId?: string | null;
  type?: NormalizedElement["type"];
  x: number;
  y: number;
  width?: number;
  height?: number;
  angle?: number;
  points?: { x: number; y: number }[];
  text?: string;
}

export type ClientToServerCollabMessage =
  | LaserFrame
  | { type: "scene.sync.request"; requestId: string }
  | {
      type: "elements.commit";
      mutationId: string;
      baseRevision: number;
      elements: NormalizedElement[];
    }
  | {
      type: "elements.preview";
      gestureId: string;
      seq: number;
      base: Record<string, { version: number; versionNonce: number }>;
      elements: PreviewWireElement[];
    }
  | { type: "elements.preview.end"; gestureId: string }
  | { type: "selection.update"; elementIds: string[] };

export type ServerToClientCollabMessage =
  | RemoteLaserFrame
  | {
      /** Display-only final geometry while the durable write is pending. */
      type: "elements.pending";
      mutationId: string;
      connectionId: string;
      userId: string;
      elements: NormalizedElement[];
    }
  | {
      type: "scene.sync.snapshot";
      requestId: string;
      revision: number;
      elements: NormalizedElement[];
      tombstones: TombstoneMap;
      chunks?: { count: number };
    }
  | {
      type: "scene.sync.chunk";
      requestId: string;
      index: number;
      count: number;
      elements: NormalizedElement[];
    }
  | {
      type: "elements.committed";
      mutationId: string;
      connectionId: string;
      userId: string;
      revision: number;
      elements: NormalizedElement[];
    }
  | {
      type: "elements.ack";
      mutationId: string;
      revision: number | null;
      saved: boolean;
      persisted?: boolean;
      corrected?: NormalizedElement[];
      missingFiles?: string[];
      reason?: string;
    }
  | { type: "scene.persisted"; revision: number }
  | {
      type: "elements.preview";
      connectionId: string;
      userId: string;
      gestureId: string;
      seq: number;
      base: Record<string, { version: number; versionNonce: number }>;
      elements: PreviewWireElement[];
    }
  | {
      type: "elements.preview.end";
      connectionId: string;
      userId: string;
      gestureId: string;
    }
  | {
      type: "selection.update";
      connectionId: string;
      userId: string;
      elementIds: string[];
    };
