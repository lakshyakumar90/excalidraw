"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { SceneSummary } from "@/lib/api/scenes";
import { createRoom, listRooms, type RoomSummary } from "@/lib/api/rooms";
import { primaryButton, secondaryButton } from "./dashboardStyles";

export function RoomsPanel({ scenes }: { scenes: SceneSummary[] }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [sceneId, setSceneId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void listRooms()
      .then((items) => {
        if (!cancelled) setRooms(items);
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : "Could not load rooms");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const available = scenes.filter(
    (scene) => !rooms.some((room) => room.sceneId === scene.id),
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const id = await createRoom(name.trim(), sceneId || undefined);
      router.push(`/room/${id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create room");
      setPending(false);
    }
  }

  return (
    <section id="rooms" className="dashboard-section mt-5">
      <div className="dashboard-section-heading">
        <div>
          <h2>Your rooms</h2>
          <p>Make a new canvas or bring one of your saved scenes into a room.</p>
        </div>
        <button
          type="button"
          className={primaryButton}
          onClick={() => {
            setName("");
            setSceneId("");
            setError("");
            dialog.current?.showModal();
          }}
        >
          Create room
        </button>
      </div>

      {loading ? (
        <p className="dashboard-muted" role="status">Loading rooms…</p>
      ) : rooms.length === 0 ? (
        <div className="dashboard-room-empty">
          <span className="dashboard-room-mark" aria-hidden="true">＋</span>
          <div>
            <p className="font-semibold text-neutral-800">A shared space for your next idea</p>
            <p className="mt-1 text-sm text-neutral-600">Start with a blank canvas or choose a saved scene.</p>
          </div>
        </div>
      ) : (
        <ul className="dashboard-room-list">
          {rooms.map((room) => (
            <li key={room.id}>
              <Link href={`/room/${room.id}`} className="dashboard-room-card">
                <span className="dashboard-room-mark" aria-hidden="true">▧</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-neutral-900">{room.slug}</span>
                  <span className="mt-1 block text-sm text-neutral-600">{room.role} · Shared canvas</span>
                </span>
                <span aria-hidden="true" className="text-lg text-neutral-400">↗</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}

      <dialog
        ref={dialog}
        className="dashboard-dialog"
        aria-labelledby="create-room-title"
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
      >
        <form onSubmit={(event) => void submit(event)}>
          <div className="dashboard-dialog-heading">
            <div>
              <p className="dashboard-eyebrow">Shared workspace</p>
              <h3 id="create-room-title">Create a room</h3>
              <p>Choose what to start with. You can invite people after the room is ready.</p>
            </div>
            <button
              type="button"
              className="dashboard-dialog-close"
              aria-label="Close"
              onClick={() => dialog.current?.close()}
            >×</button>
          </div>

          <label className="dashboard-field-label" htmlFor="new-room-name">Room name</label>
          <input
            id="new-room-name"
            autoFocus
            required
            maxLength={50}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Product brainstorm"
            className="dashboard-field"
          />

          <fieldset className="dashboard-room-choice">
            <legend>Start with</legend>
            <label className={!sceneId ? "is-selected" : ""}>
              <input type="radio" name="room-start" checked={!sceneId} onChange={() => setSceneId("")} />
              <span>
                <strong>New canvas</strong>
                <small>A clean, empty drawing board</small>
              </span>
            </label>
            <label className={sceneId ? "is-selected" : ""}>
              <input
                type="radio"
                name="room-start"
                checked={Boolean(sceneId)}
                disabled={available.length === 0}
                onChange={() => setSceneId(available[0]?.id ?? "")}
              />
              <span>
                <strong>Existing canvas</strong>
                <small>{available.length ? "Continue from a saved scene" : "No unshared scenes available"}</small>
              </span>
            </label>
          </fieldset>

          {sceneId && (
            <>
              <label className="dashboard-field-label" htmlFor="room-scene">Saved scene</label>
              <select id="room-scene" required value={sceneId} onChange={(event) => setSceneId(event.target.value)} className="dashboard-field">
                {available.map((scene) => <option key={scene.id} value={scene.id}>{scene.title}</option>)}
              </select>
            </>
          )}

          {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
          <div className="dashboard-dialog-actions">
            <button type="button" className={secondaryButton} disabled={pending} onClick={() => dialog.current?.close()}>Cancel</button>
            <button type="submit" className={primaryButton} disabled={pending || !name.trim()}>
              {pending ? "Creating room…" : "Create room"}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
