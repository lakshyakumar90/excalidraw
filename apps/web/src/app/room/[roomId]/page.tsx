"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { SavedScene } from "@/lib/api/scenes";
import { getRoom } from "@/lib/api/rooms";

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [scene, setScene] = useState<SavedScene | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void getRoom(roomId)
      .then((room) => {
        if (!cancelled) setScene(room.scene);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(
            reason instanceof Error ? reason.message : "Could not open room",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  return (
    <main className="min-h-screen bg-[#faf9f6] px-5 py-10 text-neutral-900">
      <section className="mx-auto max-w-3xl">
        <Link
          href="/dashboard"
          className="text-sm font-medium text-violet-700 hover:text-violet-900"
        >
          ← Your scenes
        </Link>
        <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-7 shadow-sm">
          {!loaded ? (
            <p className="text-sm text-neutral-500">Checking room access…</p>
          ) : error ? (
            <>
              <h1 className="text-xl font-semibold">
                Could not open this room
              </h1>
              <p className="mt-2 text-sm text-neutral-600">{error}</p>
            </>
          ) : scene ? (
            <>
              <p className="text-sm font-medium text-violet-700">
                Room {roomId}
              </p>
              <h1 className="mt-1 text-2xl font-semibold">{scene.title}</h1>
              <p className="mt-3 text-sm text-neutral-600">
                The room scene loaded with {scene.data.elements.length}{" "}
                elements. Live room editing and presence are part of Phase 14.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-violet-700">
                Room {roomId}
              </p>
              <h1 className="mt-1 text-2xl font-semibold">Room is ready</h1>
              <p className="mt-3 text-sm text-neutral-600">
                You have access. A scene has not been attached to this room yet.
                Live room editing and presence are part of Phase 14.
              </p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
