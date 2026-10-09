"use client";

import type { PresenceConnectionStatus } from "@/lib/presence/presenceSocket";

const STATUS_COPY: Record<PresenceConnectionStatus, string> = {
  connecting: "Presence connecting…",
  live: "Presence live",
  reconnecting: "Presence reconnecting…",
  offline: "Presence offline",
};

/**
 * Visible, accessible presence indicator. Scene durability is reported by
 * the separate SyncStatus component.
 */
export function PresenceStatus({
  status,
  detail,
}: {
  status: PresenceConnectionStatus;
  detail: string | null;
}) {
  const dot =
    status === "live"
      ? "bg-emerald-500"
      : status === "offline"
        ? "bg-neutral-400"
        : "bg-amber-500";
  return (
    <div className="fixed bottom-4 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col items-center gap-1">
      <p
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 rounded-full border border-black/10 bg-white/95 px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-lg backdrop-blur"
      >
        <span aria-hidden="true" className={`h-2 w-2 rounded-full ${dot}`} />
        {STATUS_COPY[status]}
      </p>
      {detail && status === "offline" && (
        <p
          role="alert"
          className="max-w-md rounded-lg border border-black/10 bg-white/95 px-3 py-1.5 text-center text-xs text-neutral-600 shadow-lg backdrop-blur"
        >
          {detail}
        </p>
      )}
    </div>
  );
}
