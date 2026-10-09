import {
  PRESENCE_THROTTLE_MS,
  normalizeElement,
  pickElementWinner,
  reconcileElements,
  type Element,
  type NormalizedElement,
  type PresenceParticipant,
  type PreviewWireElement,
  type ServerToClientCollabMessage,
  type TombstoneMap,
} from "@repo/common";
import { PreviewStore, viewportToScene, type Scene } from "@repo/engine";
import {
  PresenceConnection,
  type PresenceConnectionStatus,
} from "@/lib/presence/presenceSocket";
import { setCanvasPresencePublisher } from "@/lib/presence/presencePublisher";
import {
  removeLaser,
  receiveLaser,
  clearLaser,
  followState,
} from "@/lib/presence/laser";
import { setRoomSyncBridge } from "@/lib/sync/syncBridge";
import { createThrottledPublisher } from "@/lib/presence/throttle";
import {
  getCurrentViewport,
  subscribeViewport,
} from "@/lib/persistence/viewportStore";
import {
  draftKey,
  type DraftStore,
  type OutboxStore,
} from "@/lib/persistence/roomDraft";
import { OutboxManager } from "@/lib/sync/outbox";

/**
 * Room synchronization orchestrator (Phase 15).
 *
 * Owns the single shared room connection (presence + collaboration),
 * the room-scoped IndexedDB draft, and the durable committed-edit outbox.
 * Scene loading stays HTTP-based; every connection requests an authoritative
 * snapshot, merges it with local state via reconcileElements (never blind
 * replace), and replays pending commits with their original mutation IDs.
 * An open socket never implies durability: presence `live`, scene `syncing`,
 * and `saved` stay distinct.
 */

export type SceneSyncState = "synced" | "syncing" | "offline" | "read-only";

export interface RemoteSelection {
  connectionId: string;
  userId: string;
  displayName: string;
  elementIds: string[];
}

export interface RoomSyncState {
  status: PresenceConnectionStatus;
  detail: string | null;
  participants: PresenceParticipant[];
  selfUserId: string | null;
  selections: RemoteSelection[];
  scene: SceneSyncState;
  pending: number;
  revision: number;
  notice: string | null;
}

export interface HttpRoomScene {
  elements: Element[];
  tombstones: TombstoneMap;
  revision: number;
  knownFileIds?: string[];
}

export interface RoomFileSync {
  upload: (elements: readonly Element[]) => Promise<void>;
  download: (elements: readonly Element[]) => Promise<void>;
  seedKnown: (fileIds: readonly string[]) => void;
}

export interface RoomSyncEvents {
  getTicket: () => Promise<string>;
}

interface PendingSnapshot {
  requestId: string;
  chunks: Map<number, NormalizedElement[]> | null;
  chunkCount: number;
  revision: number;
  tombstones: TombstoneMap;
  headElements: NormalizedElement[];
}

interface BufferedDelta {
  revision: number;
  elements: NormalizedElement[];
}

const DRAFT_DEBOUNCE_MS = 300;
const OUTBOX_RETRY_MS = 15_000;
const PREVIEW_PRUNE_MS = 2_000;
const PREVIEW_TIMEOUT_MS = 5_000;
const SELECTION_THROTTLE_MS = 100;
const MAX_SELECTION_IDS = 500;

import {
  applyPresenceMessage,
  unionTombstones,
  normalizeAll,
} from "./reconciliation";

export interface RoomSyncDeps {
  roomId: string;
  sceneId: string;
  userId: string | null;
  role?: "owner" | "editor" | "viewer";
  baseUrl: string;
  scene: Scene;
  createConnection: (
    events: ConstructorParameters<typeof PresenceConnection>[2],
  ) => PresenceConnection;
  getTicket: () => Promise<string>;
  drafts: DraftStore;
  outboxStore: OutboxStore;
  clock?: () => number;
  /** Image byte sync; tests inject fakes, browsers use HTTP + IndexedDB. */
  fileSync?: RoomFileSync;
}

export class RoomSync {
  private generation = 0;
  private connection: PresenceConnection | null = null;
  private outbox: OutboxManager;
  private participants: PresenceParticipant[] = [];
  private status: PresenceConnectionStatus = "connecting";
  private detail: string | null = null;
  private notice: string | null = null;
  private readOnly = false;
  private filesBlocked = new Set<string>();
  private acceptedRevisions = new Map<string, number>();
  private revision = 0;
  private tombstones: TombstoneMap = {};
  private deferred = new Map<string, NormalizedElement>();
  /** Triples witnessed in authoritative input (snapshot/delta/correction). */
  private confirmedTriples = new Set<string>();

  private confirmTriples(elements: readonly Element[]): void {
    for (const element of elements) {
      if (Number.isSafeInteger(element.version)) {
        this.confirmedTriples.add(
          `${element.id}:${element.version}:${Number.isSafeInteger(element.versionNonce) ? element.versionNonce : 0}`,
        );
      }
    }
  }
  private pendingSync: PendingSnapshot | null = null;
  private bufferedDeltas: BufferedDelta[] = [];
  private syncCounter = 0;
  private initialized = false;
  private selfUserId: string | null;
  /** Ephemeral remote gesture previews (rendered, never persisted). */
  readonly previews = new PreviewStore();
  private remoteSelections = new Map<
    string,
    { userId: string; elementIds: string[] }
  >();
  private draftTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setInterval> | null = null;
  private previewPruneTimer: ReturnType<typeof setInterval> | null = null;
  private commitSeenSinceCaptureEnd = false;
  private wasCapturing = false;
  private snapshotVersion = 0;
  private listeners = new Set<() => void>();
  private unsubscribeScene: (() => void) | null = null;
  private unsubscribeCommit: (() => void) | null = null;
  private unsubscribeViewport: (() => void) | null = null;
  private pointerPublisher = createThrottledPublisher(
    PRESENCE_THROTTLE_MS,
    (point: { x: number; y: number }) => {
      this.connection?.send({ type: "pointer.move", x: point.x, y: point.y });
    },
  );
  private viewportPublisher = createThrottledPublisher(
    PRESENCE_THROTTLE_MS,
    (viewport: { x: number; y: number; zoom: number }) => {
      this.connection?.send({
        type: "viewport.update",
        x: viewport.x,
        y: viewport.y,
        zoom: viewport.zoom,
      });
    },
  );
  private previewPublisher = createThrottledPublisher(
    PRESENCE_THROTTLE_MS,
    (frame: {
      gestureId: string;
      seq: number;
      elements: PreviewWireElement[];
    }) => {
      if (!this.connection?.isOpen) return;
      const base: Record<string, { version: number; versionNonce: number }> =
        {};
      for (const element of frame.elements) {
        const current = this.deps.scene.getElement(element.id);
        if (current && Number.isSafeInteger(current.version)) {
          base[element.id] = {
            version: current.version as number,
            versionNonce:
              Number.isSafeInteger(current.versionNonce) &&
              (current.versionNonce ?? -1) >= 0
                ? (current.versionNonce as number)
                : 0,
          };
        }
      }
      this.connection.send({
        type: "elements.preview",
        gestureId: frame.gestureId,
        seq: frame.seq,
        base,
        elements: frame.elements,
      });
    },
  );
  private selectionPublisher = createThrottledPublisher(
    SELECTION_THROTTLE_MS,
    (elementIds: string[]) => {
      this.connection?.send({
        type: "selection.update",
        elementIds: elementIds.slice(0, MAX_SELECTION_IDS),
      });
    },
  );

  constructor(private readonly deps: RoomSyncDeps) {
    this.selfUserId = deps.userId;
    this.readOnly = deps.role === "viewer";
    this.outbox = new OutboxManager(deps.outboxStore, deps.clock ?? Date.now);
  }

  private get roomKey(): string {
    return draftKey(
      this.selfUserId ?? "anon",
      this.deps.roomId,
      this.deps.sceneId,
    );
  }

  private get clock(): () => number {
    return this.deps.clock ?? Date.now;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private snapshotCache: RoomSyncState | null = null;

  getSnapshot = (): RoomSyncState => {
    if (!this.snapshotCache) this.snapshotCache = this.buildSnapshot();
    return this.snapshotCache;
  };

  private buildSnapshot(): RoomSyncState {
    return {
      status: this.status,
      detail: this.detail,
      participants: this.participants,
      selfUserId: this.selfUserId,
      selections: this.selectionSnapshot(),
      scene: this.deriveSceneState(),
      pending: this.outbox.size,
      revision: this.revision,
      notice: this.notice,
    };
  }

  private emit(): void {
    this.snapshotVersion += 1;
    this.snapshotCache = null;
    for (const listener of this.listeners) listener();
  }

  private displayNameOf(connectionId: string, userId: string): string {
    const participant = this.participants.find(
      (entry) => entry.connectionId === connectionId,
    );
    if (participant) return participant.displayName;
    if (this.selfUserId !== null && userId === this.selfUserId) return "you";
    return "Someone";
  }

  private selectionSnapshot(): RemoteSelection[] {
    const selections: RemoteSelection[] = [];
    for (const [connectionId, selection] of this.remoteSelections) {
      if (selection.elementIds.length === 0) continue;
      selections.push({
        connectionId,
        userId: selection.userId,
        displayName: this.displayNameOf(connectionId, selection.userId),
        elementIds: [...selection.elementIds],
      });
    }
    return selections;
  }

  private deriveSceneState(): SceneSyncState {
    if (this.readOnly && this.status === "live") return "read-only";
    if (this.status !== "live") return "offline";
    if (this.pendingSync) return "syncing";
    return this.outbox.size > 0 ? "syncing" : "synced";
  }

  /**
   * Seed the canonical scene from the HTTP document merged with any local
   * draft (offline commits win by version). Must run once, before start().
   */
  async initializeWithHttpScene(http: HttpRoomScene): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    this.deps.fileSync?.seedKnown(http.knownFileIds ?? []);
    const draft = await this.deps.drafts.load(this.roomKey).catch(() => null);
    const httpTombstones = { ...http.tombstones };
    if (draft) {
      this.tombstones = unionTombstones(draft.tombstones, httpTombstones);
      this.revision = Math.max(draft.revision, http.revision);
      // The draft replays over the HTTP base: its offline commits carry
      // higher versions and survive the merge deterministically.
      this.deps.scene.replaceAll(
        reconcileElements(http.elements, draft.elements, this.tombstones)
          .merged,
      );
    } else {
      this.tombstones = httpTombstones;
      this.revision = http.revision;
      this.deps.scene.replaceAll(http.elements);
    }
    await this.persistDraft();
    await this.outbox.load(this.roomKey);
    this.emit();
  }

  start(): void {
    const generation = (this.generation += 1);
    this.unsubscribeScene = this.deps.scene.subscribe(() => {
      if (generation !== this.generation) return;
      const capturing = this.deps.scene.isCapturing();
      if (this.wasCapturing && !capturing) {
        // Capture ended; the matching commit event (if any) arrives
        // synchronously right after this notification. Defer the
        // cancel-path flush by a microtask so commits reconcile first.
        this.commitSeenSinceCaptureEnd = false;
        queueMicrotask(() => {
          if (generation !== this.generation) return;
          if (!this.commitSeenSinceCaptureEnd) {
            void this.flushDeferredAsCancel();
          }
          this.commitSeenSinceCaptureEnd = false;
        });
      }
      this.wasCapturing = capturing;
    });
    this.unsubscribeCommit = this.deps.scene.onCommit((commit) => {
      if (generation !== this.generation) return;
      this.commitSeenSinceCaptureEnd = true;
      void this.handleLocalCommit(commit.elements);
    });
    setCanvasPresencePublisher({
      pointer: (point) => this.pointerPublisher.push(point),
      leave: () => {
        this.pointerPublisher.cancel();
        this.connection?.send({ type: "pointer.leave" });
      },
    });
    setRoomSyncBridge({
      preview: (gestureId, seq, elements) =>
        this.publishLocalPreview(gestureId, seq, elements),
      endPreview: (gestureId) => this.endLocalPreview(gestureId),
      select: (elementIds) => this.publishSelection(elementIds),
      laser: (frame) => {
        if (this.connection?.isOpen) this.connection.send(frame);
      },
    });
    this.unsubscribeViewport = subscribeViewport(() => this.publishViewport());
    this.connection = this.deps.createConnection({
      getTicket: this.deps.getTicket,
      onMessage: (message) => {
        if (generation !== this.generation) return;
        if (message.type === "room.access.changed") {
          this.readOnly = message.role !== "owner" && message.role !== "editor";
          this.notice =
            message.role === null
              ? "Room access was removed. Pending edits remain on this device."
              : this.readOnly
                ? "This room is now view-only. Pending edits remain on this device."
                : null;
          if (typeof window !== "undefined")
            window.dispatchEvent(
              new CustomEvent("room-access-changed", {
                detail: { role: message.role },
              }),
            );
          if (!this.readOnly) void this.replayOutbox();
          this.emit();
          return;
        }
        const applied = applyPresenceMessage(this.participants, message);
        this.participants = applied.participants;
        if (message.type === "presence.snapshot") {
          // Full resync: drop ephemeral state for departed connections.
          const live = new Set(
            applied.participants.map((participant) => participant.connectionId),
          );
          for (const entry of this.previews.getPreviews()) {
            if (!live.has(entry.connectionId)) {
              this.previews.clearGesture(entry.connectionId, entry.gestureId);
            }
          }
          for (const connectionId of [...this.remoteSelections.keys()]) {
            if (!live.has(connectionId))
              this.remoteSelections.delete(connectionId);
          }
        }
        if (applied.leftConnectionId) {
          removeLaser(applied.leftConnectionId);
          this.previews.clearConnection(applied.leftConnectionId);
          this.remoteSelections.delete(applied.leftConnectionId);
        }
        this.emit();
      },
      onCollabMessage: (message) => {
        if (generation !== this.generation) return;
        void this.handleCollabMessage(message);
      },
      onStatus: (status, detail) => {
        if (generation !== this.generation) return;
        const wasLive = this.status === "live";
        this.status = status;
        this.detail = status === "live" ? null : detail;
        if (status === "live" && !wasLive) {
          void this.requestSync();
        }
        if (status === "live") this.detail = null;
        this.emit();
      },
    });
    this.connection.start();
    this.publishViewport();
    this.retryTimer = setInterval(() => {
      if (generation !== this.generation) return;
      if (this.status === "live") void this.replayOutbox();
    }, OUTBOX_RETRY_MS);
    if (
      this.retryTimer &&
      typeof (this.retryTimer as { unref?: () => void }).unref === "function"
    ) {
      (this.retryTimer as unknown as { unref: () => void }).unref();
    }
    this.previewPruneTimer = setInterval(() => {
      if (generation !== this.generation) return;
      this.previews.pruneOlderThan(this.clock(), PREVIEW_TIMEOUT_MS);
    }, PREVIEW_PRUNE_MS);
    if (
      this.previewPruneTimer &&
      typeof (this.previewPruneTimer as { unref?: () => void }).unref ===
        "function"
    ) {
      (this.previewPruneTimer as unknown as { unref: () => void }).unref();
    }
    this.emit();
  }

  stop(): void {
    this.generation += 1;
    if (this.unsubscribeScene) this.unsubscribeScene();
    if (this.unsubscribeCommit) this.unsubscribeCommit();
    if (this.unsubscribeViewport) this.unsubscribeViewport();
    this.unsubscribeScene =
      this.unsubscribeCommit =
      this.unsubscribeViewport =
        null;
    setCanvasPresencePublisher(null);
    setRoomSyncBridge(null);
    clearLaser();
    followState.active = false;
    this.pointerPublisher.cancel();
    this.viewportPublisher.cancel();
    this.previewPublisher.cancel();
    this.selectionPublisher.cancel();
    if (this.draftTimer !== null) {
      clearTimeout(this.draftTimer);
      this.draftTimer = null;
    }
    if (this.retryTimer !== null) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.previewPruneTimer !== null) {
      clearInterval(this.previewPruneTimer);
      this.previewPruneTimer = null;
    }
    this.connection?.close();
    this.connection = null;
    this.outbox.clear();
    this.participants = [];
    this.deferred.clear();
    this.pendingSync = null;
    this.bufferedDeltas = [];
    this.previews.clearAll();
    this.remoteSelections.clear();
  }

  private publishViewport(): void {
    if (typeof window === "undefined" || followState.active) return;
    const viewport = getCurrentViewport();
    const center = viewportToScene(
      { x: window.innerWidth / 2, y: window.innerHeight / 2 },
      viewport,
    );
    this.viewportPublisher.push({
      x: center.x,
      y: center.y,
      zoom: viewport.zoom,
    });
  }

  private async requestSync(): Promise<void> {
    const requestId = `sync-${this.generation}-${(this.syncCounter += 1)}`;
    this.pendingSync = null;
    this.bufferedDeltas = [];
    // A new sync generation obsoletes all remote ephemeral state.
    this.previews.clearAll();
    this.remoteSelections.clear();
    this.pendingSync = {
      requestId,
      chunks: null,
      chunkCount: 0,
      revision: this.revision,
      tombstones: {},
      headElements: [],
    };
    this.connection?.send({ type: "scene.sync.request", requestId });
    this.emit();
  }

  private async handleCollabMessage(
    message: ServerToClientCollabMessage,
  ): Promise<void> {
    switch (message.type) {
      case "elements.pending": {
        const gestureId = `commit:${message.mutationId}`;
        this.previews.clearGesture(message.connectionId, gestureId);
        const active = new Set(
          this.deps.scene.isCapturing() ? this.deps.scene.getCapturedIds() : [],
        );
        const elements = message.elements.filter((element) => {
          if (active.has(element.id) || element.isDeleted) return false;
          const local = this.deps.scene.getElement(element.id);
          const normalized =
            local &&
            normalizeElement(local, { strict: false, orderFallback: 0 });
          return (
            !normalized ||
            pickElementWinner(normalized, element).winner === element
          );
        });
        if (elements.length > 0) {
          const ids = new Set(elements.map((element) => element.id));
          for (const preview of this.previews.getPreviews()) {
            if (
              preview.connectionId === message.connectionId &&
              preview.elements.some((element) => ids.has(element.id))
            ) {
              this.previews.clearGesture(
                preview.connectionId,
                preview.gestureId,
              );
            }
          }
          this.previews.setPreview({
            connectionId: message.connectionId,
            gestureId,
            seq: 0,
            elements,
            receivedAt: this.clock(),
          });
        }
        return;
      }
      case "scene.sync.snapshot":
        await this.handleSnapshot(message);
        return;
      case "scene.sync.chunk":
        await this.handleChunk(message);
        return;
      case "elements.committed":
        await this.handleCommitted(message);
        return;
      case "elements.ack":
        await this.handleAck(message);
        return;
      case "scene.persisted":
        for (const [mutationId, revision] of this.acceptedRevisions) {
          if (revision <= message.revision) {
            this.acceptedRevisions.delete(mutationId);
            await this.outbox.remove(mutationId);
          }
        }
        await this.coverOutbox();
        void this.persistDraftSoon();
        this.emit();
        return;
      case "elements.preview":
        this.routeRemotePreview(message);
        return;
      case "elements.preview.end":
        this.previews.clearGesture(message.connectionId, message.gestureId);
        return;
      case "laser.move":
        if (
          this.participants.some((p) => p.connectionId === message.connectionId)
        )
          receiveLaser(message);
        return;
      case "selection.update":
        if (message.elementIds.length === 0) {
          this.remoteSelections.delete(message.connectionId);
        } else {
          this.remoteSelections.set(message.connectionId, {
            userId: message.userId,
            elementIds: [...message.elementIds],
          });
        }
        this.emit();
        return;
    }
  }

  /**
   * Route one incoming preview frame: ignore stale sequences, elements based
   * on superseded commits, and geometry for our own active gesture.
   */
  private routeRemotePreview(
    message: Extract<ServerToClientCollabMessage, { type: "elements.preview" }>,
  ): void {
    const captured =
      this.deps.scene.isCapturing() && this.selfUserId !== null
        ? new Set(this.deps.scene.getCapturedIds())
        : new Set<string>();
    const elements = message.elements.filter((element) => {
      if (captured.has(element.id)) return false;
      const base = message.base[element.id];
      if (!base) return true;
      const current = this.deps.scene.getElement(element.id);
      if (!current || !Number.isSafeInteger(current.version)) return true;
      const nonce = Number.isSafeInteger(current.versionNonce)
        ? (current.versionNonce as number)
        : 0;
      return !(
        (current.version as number) > base.version ||
        ((current.version as number) === base.version &&
          nonce > base.versionNonce)
      );
    });
    // A fully filtered frame leaves no ghost behind.
    if (elements.length === 0) return;
    this.previews.setPreview({
      connectionId: message.connectionId,
      gestureId: message.gestureId,
      seq: message.seq,
      elements,
      receivedAt: this.clock(),
    });
  }

  /** Publish one throttled local preview frame for the active gesture. */
  publishLocalPreview(
    gestureId: string,
    seq: number,
    elements: PreviewWireElement[],
  ): void {
    if (!this.connection?.isOpen || elements.length === 0) return;
    this.previewPublisher.push({ gestureId, seq, elements });
  }

  /** Keep committed gesture geometry visible through the final-frame handoff. */
  endLocalPreview(gestureId: string): void {
    if (this.commitSeenSinceCaptureEnd) {
      this.previewPublisher.flush();
      // The final display-only frame replaces this gesture when the server
      // accepts the commit for saving. Avoid a blank gap during that handoff.
      return;
    }
    this.previewPublisher.cancel();
    this.connection?.send({ type: "elements.preview.end", gestureId });
  }

  /** Publish the local selection (element IDs only, ephemeral). */
  publishSelection(elementIds: readonly string[]): void {
    this.selectionPublisher.push([...elementIds]);
  }

  private async handleSnapshot(
    message: Extract<
      ServerToClientCollabMessage,
      { type: "scene.sync.snapshot" }
    >,
  ): Promise<void> {
    const pending = this.pendingSync;
    if (!pending || message.requestId !== pending.requestId) return;
    if (message.chunks && message.chunks.count > 1) {
      this.pendingSync = {
        ...pending,
        chunks: new Map(),
        chunkCount: message.chunks.count,
        revision: message.revision,
        tombstones: { ...message.tombstones },
        headElements: [...message.elements],
      };
      this.emit();
      return;
    }
    await this.mergeSnapshot(message.revision, message.tombstones, [
      ...message.elements,
    ]);
  }

  private async handleChunk(
    message: Extract<ServerToClientCollabMessage, { type: "scene.sync.chunk" }>,
  ): Promise<void> {
    const pending = this.pendingSync;
    if (!pending || !pending.chunks || message.requestId !== pending.requestId)
      return;
    if (message.count !== pending.chunkCount) return;
    pending.chunks.set(message.index, [...message.elements]);
    if (pending.chunks.size !== pending.chunkCount) {
      this.emit();
      return;
    }
    const elements: NormalizedElement[] = [...pending.headElements];
    for (let index = 0; index < pending.chunkCount; index += 1) {
      const part = pending.chunks.get(index);
      if (!part) return;
      elements.push(...part);
    }
    await this.mergeSnapshot(pending.revision, pending.tombstones, elements);
  }

  private async mergeSnapshot(
    revision: number,
    tombstones: TombstoneMap,
    elements: NormalizedElement[],
  ): Promise<void> {
    const generation = this.generation;
    // Deltas that arrived during assembly and supersede the snapshot.
    const fresh = this.bufferedDeltas.filter(
      (delta) => delta.revision > revision,
    );
    const freshRevisions = fresh.map((delta) => delta.revision);
    const freshElements = fresh.flatMap((delta) => delta.elements);
    this.pendingSync = null;
    this.bufferedDeltas = [];
    this.tombstones = unionTombstones(this.tombstones, tombstones);
    this.revision = Math.max(this.revision, revision, ...freshRevisions);
    const local = this.deps.scene.getElements();
    const result = reconcileElements(
      local,
      [...elements, ...freshElements],
      this.tombstones,
    );
    this.confirmTriples(elements);
    this.confirmTriples(freshElements);
    this.tombstones = unionTombstones(this.tombstones, result.tombstoneUpdates);
    const captured = new Set(
      this.deps.scene.isCapturing() ? this.deps.scene.getCapturedIds() : [],
    );
    const now: NormalizedElement[] = [];
    for (const applied of result.appliedFromRemote) {
      if (captured.has(applied.id)) {
        this.noteDeferred(applied);
      } else {
        now.push(applied);
      }
    }
    if (now.length > 0) {
      const applied = this.deps.scene.applyRemote(now, this.tombstones);
      this.tombstones = unionTombstones(
        this.tombstones,
        applied.tombstoneUpdates,
      );
      void this.deps.fileSync?.download(now).catch(() => {});
    }
    if (generation !== this.generation) return;
    await this.coverOutbox();
    void this.persistDraftSoon();
    await this.replayOutbox();
    this.emit();
  }

  private async handleCommitted(
    message: Extract<
      ServerToClientCollabMessage,
      { type: "elements.committed" }
    >,
  ): Promise<void> {
    this.previews.clearGesture(
      message.connectionId,
      `commit:${message.mutationId}`,
    );
    if (this.pendingSync) {
      this.bufferedDeltas.push({
        revision: message.revision,
        elements: [...message.elements],
      });
      this.emit();
      return;
    }
    this.revision = Math.max(this.revision, message.revision);
    this.confirmTriples(message.elements);
    const captured = new Set(
      this.deps.scene.isCapturing() ? this.deps.scene.getCapturedIds() : [],
    );
    const now = message.elements.filter((element) => !captured.has(element.id));
    for (const element of message.elements) {
      if (captured.has(element.id)) this.noteDeferred(element);
    }
    if (now.length > 0) {
      const applied = this.deps.scene.applyRemote(now, this.tombstones);
      this.tombstones = unionTombstones(
        this.tombstones,
        applied.tombstoneUpdates,
      );
      void this.deps.fileSync?.download(now).catch(() => {});
    }
    await this.coverOutbox();
    void this.persistDraftSoon();
    this.emit();
  }

  private async handleAck(
    message: Extract<ServerToClientCollabMessage, { type: "elements.ack" }>,
  ): Promise<void> {
    const entry = this.outbox.get(message.mutationId);
    if (message.corrected && message.corrected.length > 0) {
      this.confirmTriples(message.corrected);
      const applied = this.deps.scene.applyRemote(
        message.corrected,
        this.tombstones,
      );
      this.tombstones = unionTombstones(
        this.tombstones,
        applied.tombstoneUpdates,
      );
      void this.deps.fileSync?.download(message.corrected).catch(() => {});
    }
    if (message.revision !== null && message.revision !== undefined) {
      this.revision = Math.max(this.revision, message.revision);
    }
    if (!entry) {
      await this.coverOutbox();
      void this.persistDraftSoon();
      this.emit();
      return;
    }
    if (message.saved && message.persisted !== false) {
      this.filesBlocked.delete(message.mutationId);
      this.acceptedRevisions.delete(message.mutationId);
      await this.outbox.remove(message.mutationId);
      this.notice = null;
    } else if (message.saved && message.revision !== null) {
      this.filesBlocked.delete(message.mutationId);
      this.acceptedRevisions.set(message.mutationId, message.revision);
      this.notice = null;
    } else if (message.reason === "forbidden") {
      this.readOnly = true;
      this.notice =
        "This room is now view-only, so new edits stay on this device.";
    } else if (message.missingFiles && message.missingFiles.length > 0) {
      this.filesBlocked.add(message.mutationId);
      this.notice = "Uploading image files before retrying the pending edit.";
      // Upload now, then unblock and replay the same mutation.
      if (entry) {
        try {
          await this.deps.fileSync?.upload(entry.elements);
          this.filesBlocked.delete(message.mutationId);
          this.notice = null;
          this.sendEntry({ ...entry, elements: entry.elements });
        } catch {
          // Still offline: stays blocked until the next sync or retry tick.
        }
      }
    } else {
      this.notice = "Saving failed — retrying in the background.";
    }
    await this.coverOutbox();
    void this.persistDraftSoon();
    this.emit();
  }

  private async handleLocalCommit(elements: Element[]): Promise<void> {
    if (elements.length === 0) return;
    if (this.readOnly) {
      await this.outbox.enqueue(this.roomKey, elements, this.revision);
      this.notice =
        "This room is now view-only. Pending edits remain on this device.";
      await this.persistDraftSoon();
      this.emit();
      return;
    }
    // Reconcile deferred remotes against the just-committed records first:
    // local winners proceed to the outbox, remote winners apply exactly.
    const survivors: Element[] = [];
    for (const committed of elements) {
      const deferred = this.deferred.get(committed.id);
      if (!deferred) {
        survivors.push(committed);
        continue;
      }
      const local = normalizeElement(committed, {
        strict: false,
        orderFallback: 0,
      });
      if (!local) {
        survivors.push(committed);
        continue;
      }
      const { winner } = pickElementWinner(local, deferred);
      this.deferred.delete(committed.id);
      if (winner === deferred) {
        this.deps.scene.applyRemote([deferred], this.tombstones);
      } else {
        survivors.push(committed);
      }
    }
    if (survivors.length === 0) {
      void this.persistDraftSoon();
      this.emit();
      return;
    }
    // Image bytes attach before the referencing commit is reported saved;
    // upload failures keep the entry files-blocked for a later retry.
    try {
      await this.deps.fileSync?.upload(survivors);
    } catch {
      // Offline or missing local bytes: the authority reports missingFiles.
    }
    const entry = await this.outbox.enqueue(
      this.roomKey,
      survivors,
      this.revision,
    );
    // Send immediately; the draft persist stays debounced and unordered.
    this.sendEntry(entry);
    this.emit();
    void this.persistDraftSoon();
  }

  private sendEntry(entry: { mutationId: string; elements: Element[] }): void {
    if (!this.connection?.isOpen) return;
    if (this.readOnly || this.filesBlocked.has(entry.mutationId)) return;
    this.connection.send({
      type: "elements.commit",
      mutationId: entry.mutationId,
      baseRevision: this.revision,
      elements: entry.elements as never,
    });
    void this.outbox.noteAttempt(entry.mutationId);
  }

  private async replayOutbox(): Promise<void> {
    if (this.status !== "live") return;
    await this.retryBlockedEntries();
    for (const entry of this.outbox.all()) {
      if (this.readOnly || this.filesBlocked.has(entry.mutationId)) continue;
      this.sendEntry(entry);
    }
  }

  /** Upload bytes for files-blocked entries, then let them replay. */
  private async retryBlockedEntries(): Promise<void> {
    for (const mutationId of [...this.filesBlocked]) {
      const entry = this.outbox.get(mutationId);
      if (!entry) {
        this.filesBlocked.delete(mutationId);
        continue;
      }
      try {
        await this.deps.fileSync?.upload(entry.elements);
        this.filesBlocked.delete(mutationId);
        if (!this.readOnly) this.notice = null;
      } catch {
        // Still offline: stays blocked until the next sync or retry tick.
      }
    }
  }

  /**
   * Drop entries the authority has absorbed: exact triples witnessed in
   * authoritative input (our save echoed back), or strictly newer records
   * (we lost and the winner already applied). Local-only content never
   * completes an entry on its own.
   */
  private async coverOutbox(): Promise<void> {
    const state = new Map<string, NormalizedElement>();
    for (const element of normalizeAll(this.deps.scene.getElements())) {
      state.set(element.id, element);
    }
    for (const entry of this.outbox.all()) {
      const uncovered = entry.elements.filter((element) => {
        const current = state.get(element.id);
        if (!current) return true;
        const version = element.version ?? 0;
        const nonce = element.versionNonce ?? 0;
        if (
          current.version > version ||
          (current.version === version && current.versionNonce > nonce)
        ) {
          return false;
        }
        if (current.version !== version || current.versionNonce !== nonce) {
          return true;
        }
        return !this.confirmedTriples.has(`${element.id}:${version}:${nonce}`);
      });
      if (uncovered.length === 0) {
        this.filesBlocked.delete(entry.mutationId);
        await this.outbox.remove(entry.mutationId);
      }
    }
    // Triples only matter while their entry is still pending.
    const pendingIds = new Set(
      (await this.outbox.all()).flatMap((entry) =>
        entry.elements.map((element) => element.id),
      ),
    );
    for (const triple of [...this.confirmedTriples]) {
      if (!pendingIds.has(triple.split(":")[0]!))
        this.confirmedTriples.delete(triple);
    }
  }

  private noteDeferred(element: NormalizedElement): void {
    this.deps.scene.noteObservedVersion(element.id, element.version);
    const existing = this.deferred.get(element.id);
    if (!existing) {
      this.deferred.set(element.id, element);
      return;
    }
    const { winner } = pickElementWinner(existing, element);
    this.deferred.set(element.id, winner === existing ? existing : element);
  }

  /** Capture ended without a commit (cancel): remote winners apply. */
  private async flushDeferredAsCancel(): Promise<void> {
    if (this.deferred.size === 0) return;
    const current = new Map(
      normalizeAll(this.deps.scene.getElements()).map((element) => [
        element.id,
        element,
      ]),
    );
    const winners: NormalizedElement[] = [];
    for (const deferred of this.deferred.values()) {
      const local = current.get(deferred.id);
      if (!local) {
        winners.push(deferred);
        continue;
      }
      const { winner, source } = pickElementWinner(local, deferred);
      if (source !== "local")
        winners.push(winner === deferred ? deferred : winner);
    }
    this.deferred.clear();
    if (winners.length > 0) {
      const applied = this.deps.scene.applyRemote(winners, this.tombstones);
      this.tombstones = unionTombstones(
        this.tombstones,
        applied.tombstoneUpdates,
      );
      await this.persistDraftSoon();
    }
    this.emit();
  }

  private persistDraftSoon(): Promise<void> {
    if (this.draftTimer !== null) return Promise.resolve();
    return new Promise((resolve) => {
      this.draftTimer = setTimeout(() => {
        this.draftTimer = null;
        void this.persistDraft().then(() => resolve());
      }, DRAFT_DEBOUNCE_MS);
    });
  }

  /** Flush any debounced draft write immediately (tests, page hide). */
  async flushDraft(): Promise<void> {
    if (this.draftTimer !== null) {
      clearTimeout(this.draftTimer);
      this.draftTimer = null;
    }
    await this.persistDraft();
  }

  private async persistDraft(): Promise<void> {
    try {
      await this.deps.drafts.save({
        key: this.roomKey,
        elements: structuredClone([...this.deps.scene.getElements()]),
        tombstones: structuredClone(this.tombstones),
        revision: this.revision,
        updatedAt: this.clock(),
      });
    } catch {
      // Draft persistence is best effort; the outbox still guards edits.
    }
  }
}
