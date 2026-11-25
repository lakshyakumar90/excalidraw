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
    <div className="editor-room-header-status fixed left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] z-40 flex min-h-9 -translate-x-1/2 items-center gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-label={presenceCopy}
        title={presenceCopy}
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 min-w-9 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/95 px-3 text-xs font-medium text-[var(--text-primary)] shadow-lg backdrop-blur-md hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      >
        <span
          aria-hidden="true"
          className={`h-2 w-2 shrink-0 rounded-full ${presenceDot}`}
        />
        <span>{people.length}</span>
      </button>
      {open && (
        <section
          aria-label="Connected people"
          className="editor-room-people-menu absolute left-1/2 top-[calc(100%+0.4rem)] w-60 -translate-x-1/2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/95 p-2 text-xs text-[var(--text-primary)] shadow-2xl backdrop-blur-md"
        >
          <p className="px-2 py-1 text-[11px] font-semibold text-[var(--text-muted)]">
            {presenceCopy}
          </p>
          {people.length === 0 ? (
            <p className="px-2 py-2 text-[var(--text-muted)]">
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
                className="flex min-h-9 w-full items-center justify-between gap-3 rounded-lg px-2 text-left hover:bg-[var(--bg-hover)] disabled:cursor-default disabled:text-[var(--text-muted)]"
              >
                <span className="truncate">{person.displayName}</span>
                {person.userId === selfUserId ? (
                  <span className="shrink-0 text-[11px] text-[var(--text-muted)]">You</span>
                ) : person.viewport ? (
                  <span className="shrink-0 text-[11px] font-medium text-[var(--text-primary)]">
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
          className="editor-room-sync-notice absolute right-0 top-[calc(100%+0.4rem)] max-w-[min(22rem,calc(100vw-1rem))] rounded-xl border border-rose-500/40 bg-[var(--bg-elevated)] px-3 py-2 text-xs text-rose-300 shadow-xl"
        >
          {sync.notice || detail}
        </span>
      )}
    </div>
  );
}
