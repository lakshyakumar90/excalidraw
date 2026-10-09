import {
  PRESENCE_THROTTLE_MS,
  normalizeElement,
  pickElementWinner,
  reconcileElements,
  type Element,
  type NormalizedElement,
  type PresenceParticipant,
  type ServerToClientCollabMessage,
  type ServerToClientPresenceMessage,
  type TombstoneMap,
} from "@repo/common";
import { viewportToScene, type Scene } from "@repo/engine";
import {
  PresenceConnection,
  type PresenceConnectionStatus,
} from "@/lib/presence/presenceSocket";
import { setCanvasPresencePublisher } from "@/lib/presence/presencePublisher";
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
import { OutboxManager, isCoveredBy } from "@/lib/sync/outbox";

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

export interface RoomSyncState {
  status: PresenceConnectionStatus;
  detail: string | null;
  participants: PresenceParticipant[];
  selfUserId: string | null;
  scene: SceneSyncState;
  pending: number;
  revision: number;
  notice: string | null;
}

export interface HttpRoomScene {
  elements: Element[];
  tombstones: TombstoneMap;
  revision: number;
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

function applyPresenceMessage(
  participants: PresenceParticipant[],
  message: ServerToClientPresenceMessage,
): PresenceParticipant[] {
  switch (message.type) {
    case "presence.snapshot":
      return message.participants;
    case "presence.joined":
      return participants.some(
        (participant) => participant.connectionId === message.participant.connectionId,
      )
        ? participants.map((participant) =>
            participant.connectionId === message.participant.connectionId
              ? message.participant
              : participant,
          )
        : [...participants, message.participant];
    case "presence.left":
      return participants.filter(
        (participant) => participant.connectionId !== message.connectionId,
      );
    case "pointer.move":
      return participants.map((participant) =>
        participant.connectionId === message.connectionId
          ? { ...participant, pointer: { x: message.x, y: message.y } }
          : participant,
      );
    case "viewport.update":
      return participants.map((participant) =>
        participant.connectionId === message.connectionId
          ? {
              ...participant,
              viewport: { x: message.x, y: message.y, zoom: message.zoom },
            }
          : participant,
      );
    case "pointer.leave":
      return participants.map((participant) =>
        participant.connectionId === message.connectionId
          ? { ...participant, pointer: undefined }
          : participant,
      );
    case "error":
      return participants;
  }
}

function unionTombstones(
  ...maps: Record<string, { version: number; versionNonce: number; deletedAt: string } | null | undefined>[]
): TombstoneMap {
  const union: TombstoneMap = {};
  for (const map of maps) {
    for (const [id, entry] of Object.entries(map)) {
      if (!entry) continue;
      const existing = union[id];
      if (
        !existing ||
        entry.version > existing.version ||
        (entry.version === existing.version && entry.versionNonce > existing.versionNonce)
      ) {
        union[id] = { ...entry };
      } else if (existing.deletedAt === "" && entry.deletedAt !== "") {
        union[id] = { ...existing, deletedAt: entry.deletedAt };
      }
    }
  }
  return union;
}

function normalizeAll(elements: readonly Element[]): NormalizedElement[] {
  const out: NormalizedElement[] = [];
  for (const element of elements) {
    const normalized = normalizeElement(element, { strict: false, orderFallback: 0 });
    if (normalized) out.push(normalized);
  }
  return out;
}

export interface RoomSyncDeps {
  roomId: string;
  sceneId: string;
  userId: string | null;
  baseUrl: string;
  scene: Scene;
  createConnection: (
    events: ConstructorParameters<typeof PresenceConnection>[2],
  ) => PresenceConnection;
  getTicket: () => Promise<string>;
  drafts: DraftStore;
  outboxStore: OutboxStore;
  clock?: () => number;
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
  private revision = 0;
  private tombstones: TombstoneMap = {};
  private deferred = new Map<string, NormalizedElement>();
  private pendingSync: PendingSnapshot | null = null;
  private bufferedDeltas: BufferedDelta[] = [];
  private syncCounter = 0;
  private initialized = false;
  private selfUserId: string | null;
  private draftTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setInterval> | null = null;
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

  constructor(private readonly deps: RoomSyncDeps) {
    this.selfUserId = deps.userId;
    this.outbox = new OutboxManager(deps.outboxStore, deps.clock ?? Date.now);
  }

  private get roomKey(): string {
    return draftKey(this.selfUserId ?? "anon", this.deps.roomId, this.deps.sceneId);
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

  getSnapshot = (): RoomSyncState => ({
    status: this.status,
    detail: this.detail,
    participants: this.participants,
    selfUserId: this.selfUserId,
    scene: this.deriveSceneState(),
    pending: this.outbox.size,
    revision: this.revision,
    notice: this.notice,
  });

  private emit(): void {
    this.snapshotVersion += 1;
    for (const listener of this.listeners) listener();
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
    const draft = await this.deps.drafts.load(this.roomKey).catch(() => null);
    const httpTombstones = { ...http.tombstones };
    if (draft) {
      this.tombstones = unionTombstones(draft.tombstones, httpTombstones);
      this.revision = Math.max(draft.revision, http.revision);
      // The draft replays over the HTTP base: its offline commits carry
      // higher versions and survive the merge deterministically.
      this.deps.scene.replaceAll(
        reconcileElements(http.elements, draft.elements, this.tombstones).merged,
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
    this.unsubscribeViewport = subscribeViewport(() => this.publishViewport());
    this.connection = this.deps.createConnection({
      getTicket: this.deps.getTicket,
      onMessage: (message) => {
        if (generation !== this.generation) return;
        this.participants = applyPresenceMessage(this.participants, message);
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
    if (this.retryTimer && typeof (this.retryTimer as { unref?: () => void }).unref === "function") {
      (this.retryTimer as unknown as { unref: () => void }).unref();
    }
    this.emit();
  }

  stop(): void {
    this.generation += 1;
    if (this.unsubscribeScene) this.unsubscribeScene();
    if (this.unsubscribeCommit) this.unsubscribeCommit();
    if (this.unsubscribeViewport) this.unsubscribeViewport();
    this.unsubscribeScene = this.unsubscribeCommit = this.unsubscribeViewport = null;
    setCanvasPresencePublisher(null);
    this.pointerPublisher.cancel();
    this.viewportPublisher.cancel();
    if (this.draftTimer !== null) {
      clearTimeout(this.draftTimer);
      this.draftTimer = null;
    }
    if (this.retryTimer !== null) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
    this.connection?.close();
    this.connection = null;
    this.outbox.clear();
    this.participants = [];
    this.deferred.clear();
    this.pendingSync = null;
    this.bufferedDeltas = [];
  }

  private publishViewport(): void {
    if (typeof window === "undefined") return;
    const viewport = getCurrentViewport();
    const center = viewportToScene(
      { x: window.innerWidth / 2, y: window.innerHeight / 2 },
      viewport,
    );
    this.viewportPublisher.push({ x: center.x, y: center.y, zoom: viewport.zoom });
  }

  private async requestSync(): Promise<void> {
    const requestId = `sync-${this.generation}-${(this.syncCounter += 1)}`;
    this.pendingSync = null;
    this.bufferedDeltas = [];
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
      case "elements.preview":
      case "elements.preview.end":
      case "selection.update":
        // Routed in the drag/selection slice; ignored until then.
        return;
    }
  }

  private async handleSnapshot(message: Extract<ServerToClientCollabMessage, { type: "scene.sync.snapshot" }>): Promise<void> {
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

  private async handleChunk(message: Extract<ServerToClientCollabMessage, { type: "scene.sync.chunk" }>): Promise<void> {
    const pending = this.pendingSync;
    if (!pending || !pending.chunks || message.requestId !== pending.requestId) return;
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
    const fresh = this.bufferedDeltas.filter((delta) => delta.revision > revision);
    const freshRevisions = fresh.map((delta) => delta.revision);
    const freshElements = fresh.flatMap((delta) => delta.elements);
    this.pendingSync = null;
    this.bufferedDeltas = [];
    this.tombstones = unionTombstones(this.tombstones, tombstones);
    this.revision = Math.max(this.revision, revision, ...freshRevisions);
    const local = this.deps.scene.getElements();
    const result = reconcileElements(local, [...elements, ...freshElements], this.tombstones);
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
      this.tombstones = unionTombstones(this.tombstones, applied.tombstoneUpdates);
    }
    if (generation !== this.generation) return;
    await this.coverOutbox();
    void this.persistDraftSoon();
    await this.replayOutbox();
    this.emit();
  }

  private async handleCommitted(message: Extract<ServerToClientCollabMessage, { type: "elements.committed" }>): Promise<void> {
    if (this.pendingSync) {
      this.bufferedDeltas.push({ revision: message.revision, elements: [...message.elements] });
      this.emit();
      return;
    }
    this.revision = Math.max(this.revision, message.revision);
    const captured = new Set(
      this.deps.scene.isCapturing() ? this.deps.scene.getCapturedIds() : [],
    );
    const now = message.elements.filter((element) => !captured.has(element.id));
    for (const element of message.elements) {
      if (captured.has(element.id)) this.noteDeferred(element);
    }
    if (now.length > 0) {
      const applied = this.deps.scene.applyRemote(now, this.tombstones);
      this.tombstones = unionTombstones(this.tombstones, applied.tombstoneUpdates);
    }
    await this.coverOutbox();
    void this.persistDraftSoon();
    this.emit();
  }

  private async handleAck(message: Extract<ServerToClientCollabMessage, { type: "elements.ack" }>): Promise<void> {
    const entry = this.outbox.get(message.mutationId);
    if (message.corrected && message.corrected.length > 0) {
      const applied = this.deps.scene.applyRemote(message.corrected, this.tombstones);
      this.tombstones = unionTombstones(this.tombstones, applied.tombstoneUpdates);
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
    if (message.saved) {
      this.filesBlocked.delete(message.mutationId);
      await this.outbox.remove(message.mutationId);
      this.notice = null;
    } else if (message.reason === "forbidden") {
      this.readOnly = true;
      this.notice = "This room is now view-only, so new edits stay on this device.";
    } else if (message.missingFiles && message.missingFiles.length > 0) {
      this.filesBlocked.add(message.mutationId);
      this.notice = "Uploading image files before retrying the pending edit.";
    } else {
      this.notice = "Saving failed — retrying in the background.";
    }
    await this.coverOutbox();
    void this.persistDraftSoon();
    this.emit();
  }

  private async handleLocalCommit(elements: Element[]): Promise<void> {
    if (elements.length === 0) return;
    // Reconcile deferred remotes against the just-committed records first:
    // local winners proceed to the outbox, remote winners apply exactly.
    const survivors: Element[] = [];
    for (const committed of elements) {
      const deferred = this.deferred.get(committed.id);
      if (!deferred) {
        survivors.push(committed);
        continue;
      }
      const local = normalizeElement(committed, { strict: false, orderFallback: 0 });
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
    const entry = await this.outbox.enqueue(this.roomKey, survivors, this.revision);
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
    for (const entry of this.outbox.all()) {
      if (this.readOnly || this.filesBlocked.has(entry.mutationId)) continue;
      this.sendEntry(entry);
    }
  }

  /**
   * Drop entries the authority has absorbed. Content coverage alone is not
   * enough: an unacked local commit covers itself. Removal additionally
   * requires durable progress past the entry's base revision (every save
   * bumps the revision) or an explicit saved acknowledgement.
   */
  private async coverOutbox(): Promise<void> {
    const state = new Map<string, NormalizedElement>();
    for (const element of normalizeAll(this.deps.scene.getElements())) {
      state.set(element.id, element);
    }
    for (const entry of this.outbox.all()) {
      if (this.revision <= entry.baseRevision) continue;
      const uncovered = entry.elements.filter(
        (element) => !isCoveredBy(element, state),
      );
      if (uncovered.length === 0) {
        this.filesBlocked.delete(entry.mutationId);
        await this.outbox.remove(entry.mutationId);
      }
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
      normalizeAll(this.deps.scene.getElements()).map((element) => [element.id, element]),
    );
    const winners: NormalizedElement[] = [];
    for (const deferred of this.deferred.values()) {
      const local = current.get(deferred.id);
      if (!local) {
        winners.push(deferred);
        continue;
      }
      const { winner, source } = pickElementWinner(local, deferred);
      if (source !== "local") winners.push(winner === deferred ? deferred : winner);
    }
    this.deferred.clear();
    if (winners.length > 0) {
      const applied = this.deps.scene.applyRemote(winners, this.tombstones);
      this.tombstones = unionTombstones(this.tombstones, applied.tombstoneUpdates);
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
