"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { Element, TombstoneMap } from "@repo/common";
import { CanvasWorkspace } from "@/components/canvas/CanvasWorkspace";
import { RoomPresence } from "@/components/presence/RoomPresence";
import { getRoom, saveRoomScene } from "@/lib/api/rooms";
import { viewportFromSceneData } from "@/lib/api/scenes";
import { cacheSavedSceneFiles } from "@/lib/persistence/savedScene";

// Rooms are created at runtime; no room IDs are generated at build time.
export const dynamicParams = true;

type Room = Awaited<ReturnType<typeof getRoom>>;
export default function RoomCanvasPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    void getRoom(roomId)
      .then(async (loaded) => {
        await cacheSavedSceneFiles(loaded.scene?.data.files);
        if (!cancelled) setRoom(loaded);
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(
            reason instanceof Error ? reason.message : "Could not load room",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [roomId]);
  if (room?.scene && room.role !== "viewer") {
    const data = room.scene.data as {
      elements: Element[];
      files?: Record<string, unknown>;
      sync?: { tombstones?: TombstoneMap; revision?: number };
    };
    const httpScene = {
      elements: data.elements as Element[],
      tombstones: { ...(data.sync?.tombstones ?? {}) } as TombstoneMap,
      revision:
        typeof data.sync?.revision === "number" ? data.sync.revision : 0,
      knownFileIds: Object.keys(data.files ?? {}),
    };
    return (
      <>
        <CanvasWorkspace
          savedScene={{
            id: room.scene.id,
            elements: room.scene.data.elements as Element[],
            viewport: viewportFromSceneData(room.scene.data),
            saveData: (sceneData) => saveRoomScene(roomId, sceneData),
            roomSync: { roomId, sceneId: room.scene.id },
          }}
        />
        <RoomPresence
          key={`${roomId}:${room.scene.id}`}
          roomId={roomId}
          sceneId={room.scene.id}
          httpScene={httpScene}
        />
      </>
    );
  }
  return (
    <main className="grid min-h-screen place-items-center bg-[#faf9f6] p-5 text-neutral-900">
      <p role={error ? "alert" : "status"}>
        {error || (room ? "This room has no editable scene." : "Loading room…")}
      </p>
    </main>
  );
}
