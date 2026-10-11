"use client";

import { useState } from "react";
import type { PresenceParticipant } from "@repo/common";
import type { PresenceConnectionStatus } from "@/lib/presence/presenceSocket";
import type { RoomSyncState } from "@/lib/sync/roomSync";

const presenceLabel: Record<PresenceConnectionStatus, string> = {
  connecting: "Connecting",
  live: "Live",
  reconnecting: "Reconnecting",
  offline: "Offline",
};

export function RoomHeaderStatus({
  status,
  detail,
  participants,
  selfUserId,
  sync,
  onFollow,
}: {
  status: PresenceConnectionStatus;
  detail: string | null;
  participants: PresenceParticipant[];
  selfUserId: string | null;
  sync: RoomSyncState;
  onFollow: (connectionId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const people = Array.from(
    new Map(participants.map((person) => [person.userId, person])).values(),
  );
  const presenceCopy = `${presenceLabel[status]} · ${people.length} ${people.length === 1 ? "person" : "people"} connected`;
  const presenceDot =
    status === "live"
      ? "bg-emerald-500"
      : status === "offline"
        ? "bg-red-500"
        : "bg-amber-500";

  return (
    <div className="editor-room-header-status fixed right-2 top-[max(0.25rem,env(safe-area-inset-top))] z-50 flex min-h-11 items-center gap-2">
      {sync.scene === "synced" ? (
        <span
          role="status"
          aria-label="All changes saved"
          title="All changes saved"
          className="grid h-9 w-9 place-items-center rounded-full text-emerald-700"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="h-5 w-5"
            fill="none"
          >
            <path
              d="m4 10 4 4 8-8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      ) : sync.scene === "offline" ? (
        <span
          role="status"
          aria-label="Changes are waiting to sync"
          title="Changes are waiting to sync"
          className="grid h-9 w-9 place-items-center rounded-full text-red-700"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="h-5 w-5"
            fill="none"
          >
            <path
              d="M4 4l12 12M8 8a3 3 0 0 1 4 4m-8-1a5 5 0 0 1 1.5-3.5M14.5 7.5A5 5 0 0 1 16 11"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
        </span>
      ) : null}
      <button
        type="button"
        aria-expanded={open}
        aria-label={presenceCopy}
        title={presenceCopy}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white/95 px-3 text-xs font-medium text-neutral-700 shadow-sm hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
      >
        <span
          aria-hidden="true"
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${presenceDot}`}
        />
        <span>{people.length}</span>
      </button>
      {open && (
        <section
          aria-label="Connected people"
          className="editor-room-people-menu absolute right-0 top-[calc(100%+0.4rem)] w-60 rounded-xl border border-neutral-200 bg-white p-2 text-sm text-neutral-800 shadow-lg"
        >
          <p className="px-2 py-1 text-xs font-semibold text-neutral-500">
            {presenceCopy}
          </p>
          {people.length === 0 ? (
            <p className="px-2 py-2 text-neutral-500">
              Waiting for participants…
            </p>
          ) : (
            people.map((person) => (
              <button
                key={person.userId}
                type="button"
                disabled={person.userId === selfUserId || !person.viewport}
                onClick={() => {
                  onFollow(person.connectionId);
                  setOpen(false);
                }}
                className="flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-2 text-left hover:bg-neutral-50 disabled:cursor-default disabled:text-neutral-500"
              >
                <span className="truncate">{person.displayName}</span>
                {person.userId === selfUserId ? (
                  <span className="shrink-0 text-xs">You</span>
                ) : person.viewport ? (
                  <span className="shrink-0 text-xs text-violet-700">
                    Follow
                  </span>
                ) : null}
              </button>
            ))
          )}
        </section>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {sync.scene === "syncing"
          ? "Saving changes"
          : sync.scene === "offline"
            ? "Changes are waiting to sync"
            : sync.scene === "read-only"
              ? "View only"
              : "All changes saved"}
      </span>
      {(sync.notice || (status === "offline" ? detail : null)) && (
        <span
          role="alert"
          className="editor-room-sync-notice absolute right-0 top-[calc(100%+0.4rem)] max-w-[min(22rem,calc(100vw-1rem))] rounded-lg border border-red-200 bg-white px-3 py-2 text-xs text-red-800 shadow-lg"
        >
          {sync.notice || detail}
        </span>
      )}
    </div>
  );
}
