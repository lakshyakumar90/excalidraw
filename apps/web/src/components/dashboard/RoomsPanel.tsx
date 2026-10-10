"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { SceneSummary } from "@/lib/api/scenes";
import { listRooms, shareScene, type RoomSummary } from "@/lib/api/rooms";
import { primaryButton } from "./dashboardStyles";

export function RoomsPanel({ scenes }: { scenes: SceneSummary[] }) {
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [sceneId, setSceneId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void listRooms()
      .then((items) => {
        if (!cancelled) setRooms(items);
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(
            reason instanceof Error ? reason.message : "Could not load rooms",
          );
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const available = scenes.filter(
    (scene) => !rooms.some((room) => room.sceneId === scene.id),
  );
  async function submit() {
    setPending(true);
    setError("");
    try {
      const { roomId: id } = await shareScene(name.trim(), sceneId);
      setRooms(await listRooms());
      setName("");
      setSceneId("");
      router.push(`/room/${id}`);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not create room",
      );
      setPending(false);
    }
  }
  return (
    <section id="rooms" className="dashboard-section mt-8">
      <h2 className="text-lg font-semibold">Your rooms</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Share a saved scene with invited people and collaborate in real time.
      </p>
      {rooms.length > 0 && (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {rooms.map((room) => (
            <li key={room.id}>
              <Link
                className="block rounded-lg border border-neutral-200 p-3 text-sm hover:bg-neutral-50"
                href={`/room/${room.id}`}
              >
                {room.slug}{" "}
                <span className="text-neutral-500">· {room.role}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {available.length > 0 && (
        <form
          className="mt-5 border-t border-neutral-200 pt-5"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <h3 className="text-sm font-semibold">Share a scene</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              aria-label="Room name"
              placeholder="Room name"
              required
              maxLength={50}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="min-w-40 flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
            <select
              aria-label="Scene"
              required
              value={sceneId}
              onChange={(event) => setSceneId(event.target.value)}
              className="min-w-40 flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="">Choose a scene</option>
              {available.map((scene) => (
                <option key={scene.id} value={scene.id}>
                  {scene.title}
                </option>
              ))}
            </select>
            <button disabled={pending} className={primaryButton}>
              {pending ? "Creating…" : "Share scene"}
            </button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
