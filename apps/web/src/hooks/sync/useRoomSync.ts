"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { authClient } from "@repo/auth/client";
import type { Element, TombstoneMap } from "@repo/common";
import type { RoomRole } from "@repo/common";
import { scene } from "@/lib/scene/scene";
import { fetchPresenceTicket } from "@/lib/api/rooms";
import { PresenceConnection } from "@/lib/presence/presenceSocket";
import {
  createIndexedDbDraftStore,
  createIndexedDbOutboxStore,
  type OutboxStore,
  type DraftStore,
} from "@/lib/persistence/roomDraft";
import { createRoomFileSync } from "@/lib/sync/roomFiles";
import { RoomSync, type HttpRoomScene, type RoomSyncDeps, type RoomSyncState } from "@/lib/sync/roomSync";
import type { PreviewStore } from "@repo/engine";

const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080";

export interface UseRoomSyncOptions {
  roomId: string;
  sceneId: string;
  httpScene: HttpRoomScene | null;
  role?: RoomRole;
  drafts?: DraftStore;
  outboxStore?: OutboxStore;
  createConnection?: RoomSyncDeps["createConnection"];
  fileSync?: RoomSyncDeps["fileSync"];
}

export interface UseRoomSyncResult extends RoomSyncState {
  previews: PreviewStore;
}

/**
 * Owns the room's shared connection, draft, and outbox. Presence `live`,
 * scene `syncing`, and `saved` stay distinct in the returned state.
 */
export function useRoomSync({
  roomId,
  sceneId,
  httpScene,
  role,
  drafts,
  outboxStore,
  createConnection,
  fileSync,
}: UseRoomSyncOptions): UseRoomSyncResult {
  const { data: session } = authClient.useSession();
  const selfUserId = session?.user?.id ?? null;

  const sync = useMemo(
    () =>
      new RoomSync({
        roomId,
        sceneId,
        userId: selfUserId,
        role,
        baseUrl: WS_BASE_URL,
        scene,
        createConnection:
          createConnection ??
          ((events) => new PresenceConnection(WS_BASE_URL, roomId, events)),
        getTicket: () => fetchPresenceTicket(roomId),
        drafts: drafts ?? createIndexedDbDraftStore(),
        outboxStore: outboxStore ?? createIndexedDbOutboxStore(),
        fileSync: fileSync ?? createRoomFileSync(roomId),
      }),
    // One sync instance per room+scene; session changes reconnect via key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roomId, sceneId, role],
  );

  const state = useSyncExternalStore(
    sync.subscribe,
    sync.getSnapshot,
    sync.getSnapshot,
  );

  useEffect(() => {
    if (!httpScene) return;
    let cancelled = false;
    void sync.initializeWithHttpScene(httpScene).then(() => {
      if (!cancelled) sync.start();
    });
    return () => {
      cancelled = true;
      sync.stop();
    };
  }, [sync, httpScene]);

  // The preview store instance is stable per sync instance.
  const previews = useMemo(() => sync.previews, [sync]);
  return { ...state, selfUserId, previews };
}

export type { Element, TombstoneMap };
