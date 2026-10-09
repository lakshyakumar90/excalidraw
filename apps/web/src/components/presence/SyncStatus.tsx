"use client";

import type { RoomSyncState } from "@/lib/sync/roomSync";

/**
 * Save/sync indicator, distinct from the presence connection pill. An open
 * socket never implies durability: only an empty outbox means saved.
 */
export function SyncStatus({ sync }: { sync: RoomSyncState }) {
  const { scene, pending, notice } = sync;
  const label =
    scene === "synced"
      ? "All changes saved"
      : scene === "syncing"
        ? pending > 0
          ? `Syncing ${pending} edit${pending === 1 ? "" : "s"}…`
          : "Syncing…"
        : scene === "read-only"
          ? "View-only — edits stay on this device"
          : pending > 0
            ? `Offline — ${pending} edit${pending === 1 ? "" : "s"} waiting`
            : "Offline";
  const dot =
    scene === "synced"
      ? "bg-emerald-500"
      : scene === "syncing"
        ? "bg-amber-500"
        : scene === "read-only"
          ? "bg-sky-500"
          : "bg-neutral-400";
  return (
    <div className="fixed bottom-16 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col items-center gap-1">
      <p
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 rounded-full border border-black/10 bg-white/95 px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-lg backdrop-blur"
      >
        <span aria-hidden="true" className={`h-2 w-2 rounded-full ${dot}`} />
        {label}
      </p>
      {notice && (
        <p
          role="alert"
          className="max-w-md rounded-lg border border-black/10 bg-white/95 px-3 py-1.5 text-center text-xs text-neutral-600 shadow-lg backdrop-blur"
        >
          {notice}
        </p>
      )}
    </div>
  );
}
