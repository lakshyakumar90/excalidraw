"use client";

import Link from "next/link";
import { useState } from "react";

export interface GuestSyncBannerProps {
  hasLocalBoard: boolean;
  isAuthenticated: boolean;
}

/**
 * Compact floating pill shown when a guest user has unsaved local IndexedDB
 * boards, linking directly to sign-in with automatic one-click guestImport.
 */
export function GuestSyncBanner({
  hasLocalBoard,
  isAuthenticated,
}: GuestSyncBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || isAuthenticated || !hasLocalBoard) return null;

  return (
    <div
      role="status"
      data-editor-chrome
      className="fixed bottom-3 left-1/2 z-30 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/95 px-3 py-1.5 text-xs text-[var(--text-primary)] shadow-lg backdrop-blur-md"
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
      <span className="truncate text-[var(--text-muted)]">
        Local board · Sign in to sync
      </span>
      <Link
        href="/sign-in?returnTo=%2Fboards%3FimportGuest%3D1"
        className="shrink-0 rounded-lg bg-[var(--accent)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent-fg)] transition hover:bg-[var(--accent-hover)]"
      >
        Sign in
      </Link>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss sync banner"
        className="rounded-md p-0.5 text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        ✕
      </button>
    </div>
  );
}
