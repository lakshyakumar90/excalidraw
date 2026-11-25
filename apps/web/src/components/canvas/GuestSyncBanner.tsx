"use client";

import Link from "next/link";
import { useState } from "react";

export interface GuestSyncBannerProps {
  hasLocalBoard: boolean;
  isAuthenticated: boolean;
}

/**
 * Non-intrusive top banner shown when a guest user has unsaved local IndexedDB
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
      className="fixed left-1/2 top-16 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/95 px-4 py-1.5 text-xs text-[var(--text-primary)] shadow-md backdrop-blur-md"
    >
      <span className="h-2 w-2 rounded-full bg-indigo-400" />
      <span>Sign in to sync &amp; share your board to the cloud.</span>
      <Link
        href="/sign-in?returnTo=%2Fboards%3FimportGuest%3D1"
        className="rounded-full bg-[var(--accent)] px-3 py-1 font-semibold text-white hover:bg-[var(--accent-hover)]"
      >
        Sign in &amp; sync
      </Link>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss sync banner"
        className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      >
        ✕
      </button>
    </div>
  );
}
