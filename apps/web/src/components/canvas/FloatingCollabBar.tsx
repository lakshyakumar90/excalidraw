"use client";

import Link from "next/link";
import type { CanvasTheme } from "@repo/engine";

export interface ActiveCollaborator {
  connectionId: string;
  userId: string;
  displayName: string;
  color?: string;
}

export type SyncIndicatorState = "saved" | "syncing" | "offline";

export interface FloatingCollabBarProps {
  collaborators?: ActiveCollaborator[];
  followingConnectionId?: string | null;
  onToggleFollow?: (connectionId: string) => void;
  syncState?: SyncIndicatorState;
  theme: CanvasTheme;
  onToggleTheme: () => void;
  onOpenShare?: () => void;
  onOpenMcp?: () => void;
  onOpenHistory?: () => void;
  onOpenDiagramCode?: () => void;
  onOpenSlides?: () => void;
  onOpenAiPalette?: () => void;
  roomId?: string;
}

const AVATAR_COLORS = [
  "#6366F1",
  "#10B981",
  "#F59E0B",
  "#EC4899",
  "#06B6D4",
  "#8B5CF6",
];

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "U";
}

export function FloatingCollabBar({
  collaborators = [],
  followingConnectionId = null,
  onToggleFollow,
  syncState = "saved",
  theme,
  onToggleTheme,
  onOpenShare,
  onOpenMcp,
  onOpenHistory,
  onOpenDiagramCode,
  onOpenSlides,
  onOpenAiPalette,
}: FloatingCollabBarProps) {
  const syncDotClass =
    syncState === "saved"
      ? "bg-emerald-400"
      : syncState === "syncing"
        ? "bg-amber-400 animate-pulse"
        : "bg-rose-500";

  const syncLabel =
    syncState === "saved"
      ? "Saved"
      : syncState === "syncing"
        ? "Syncing…"
        : "Offline";

  return (
    <div
      data-editor-chrome
      className="fixed right-4 top-4 z-40 flex flex-wrap items-center gap-2"
    >
      {/* Active collaborator avatar stack with presenter follow */}
      {collaborators.length > 0 && (
        <div className="flex items-center -space-x-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/90 px-2 py-1 shadow-sm backdrop-blur-md">
          {collaborators.slice(0, 5).map((person, idx) => {
            const isFollowing = followingConnectionId === person.connectionId;
            return (
              <button
                key={person.connectionId}
                type="button"
                onClick={() => onToggleFollow?.(person.connectionId)}
                title={
                  isFollowing
                    ? `Stop following ${person.displayName}`
                    : `Follow ${person.displayName}'s viewport`
                }
                style={{
                  backgroundColor:
                    person.color ?? AVATAR_COLORS[idx % AVATAR_COLORS.length],
                }}
                className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white transition-transform hover:z-10 hover:scale-105 ${
                  isFollowing
                    ? "ring-2 ring-emerald-400 ring-offset-2 ring-offset-[var(--bg-elevated)]"
                    : "ring-2 ring-[var(--bg-elevated)]"
                }`}
              >
                {initialsFor(person.displayName)}
              </button>
            );
          })}
          {collaborators.length > 5 && (
            <span className="pl-2 text-xs text-[var(--text-muted)]">
              +{collaborators.length - 5}
            </span>
          )}
        </div>
      )}

      {/* Compact action pill */}
      <div className="flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/90 px-2 py-1 text-xs shadow-sm backdrop-blur-md">
        <span
          className="flex items-center gap-1.5 px-2 text-[var(--text-muted)]"
          title={`Sync status: ${syncLabel}`}
        >
          <span className={`h-2 w-2 rounded-full ${syncDotClass}`} />
          <span className="hidden sm:inline">{syncLabel}</span>
        </span>

        {onOpenAiPalette && (
          <button
            type="button"
            onClick={onOpenAiPalette}
            title="AI Diagram Generator (Cmd/Ctrl+K)"
            className="rounded-full px-2.5 py-1 font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
          >
            AI <kbd className="ml-0.5 text-[10px] opacity-60">⌘K</kbd>
          </button>
        )}

        {onOpenDiagramCode && (
          <button
            type="button"
            onClick={onOpenDiagramCode}
            title="Toggle Mermaid Diagram Code pane"
            className="rounded-full px-2.5 py-1 font-medium text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
          >
            Code
          </button>
        )}

        {onOpenSlides && (
          <button
            type="button"
            onClick={onOpenSlides}
            title="Toggle Slides Filmstrip"
            className="rounded-full px-2.5 py-1 font-medium text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
          >
            Slides
          </button>
        )}

        {onOpenHistory && (
          <button
            type="button"
            onClick={onOpenHistory}
            title="Version History"
            className="rounded-full px-2.5 py-1 font-medium text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
          >
            History
          </button>
        )}

        {onOpenMcp && (
          <button
            type="button"
            onClick={onOpenMcp}
            title="Connect MCP Agent (Cursor, Claude Code, OpenCode, Codex CLI, AntiGravity CLI)"
            className="rounded-full border border-[var(--border-subtle)] px-2.5 py-1 font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
          >
            MCP
          </button>
        )}

        {onOpenShare && (
          <button
            type="button"
            onClick={onOpenShare}
            className="rounded-full bg-[var(--accent)] px-3 py-1 font-semibold text-white hover:bg-[var(--accent-hover)]"
          >
            Share
          </button>
        )}

        <button
          type="button"
          onClick={onToggleTheme}
          title={`Switch to ${theme === "dark" ? "Light" : "Dark"} mode`}
          aria-label="Toggle canvas theme"
          className="rounded-full px-2 py-1 text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>

        <Link
          href="/boards"
          title="My Boards"
          className="rounded-full px-2.5 py-1 font-medium text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
        >
          Boards
        </Link>
      </div>
    </div>
  );
}
