"use client";

import { useState } from "react";
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
  onOpenSands?: () => void;
  sandsOpen?: boolean;
  sandsCount?: number;
  onOpenHistory?: () => void;
  onOpenDiagramCode?: () => void;
  onOpenSlides?: () => void;
  onOpenAiPalette?: () => void;
  aiOpen?: boolean;
  slidesOpen?: boolean;
  codeOpen?: boolean;
  historyOpen?: boolean;
  libraryOpen?: boolean;
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
  onOpenMcp,
  onOpenSands,
  sandsOpen = false,
  sandsCount = 0,
  onOpenHistory,
  onOpenDiagramCode,
  onOpenSlides,
  onOpenAiPalette,
  aiOpen = false,
  slidesOpen = false,
  codeOpen = false,
  historyOpen = false,
  libraryOpen = false,
}: FloatingCollabBarProps) {
  const [hovered, setHovered] = useState(false);
  const drawerOpen = aiOpen || slidesOpen || codeOpen || historyOpen || libraryOpen;

  const dockBtn = (active: boolean) =>
    `grid h-8 w-8 place-items-center rounded-lg text-[11px] font-semibold transition ${
      active
        ? "bg-[var(--accent)] text-[var(--accent-fg)]"
        : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
    }`;

  return (
    <div
      data-editor-chrome
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`fixed top-[max(3.75rem,calc(env(safe-area-inset-top)+3.25rem))] z-40 flex flex-col items-end gap-2 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        drawerOpen ? "right-[min(23.5rem,calc(100vw-3rem))]" : "right-3"
      }`}
    >
      {/* Active collaborator avatar stack */}
      {collaborators.length > 0 && (
        <div className="flex items-center -space-x-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/95 p-1 shadow-xl backdrop-blur-md">
          {collaborators.slice(0, 4).map((person, idx) => {
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
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white transition-transform hover:z-10 hover:scale-105 ${
                  isFollowing
                    ? "ring-2 ring-emerald-400 ring-offset-2 ring-offset-[var(--bg-elevated)]"
                    : "ring-2 ring-[var(--bg-elevated)]"
                }`}
              >
                {initialsFor(person.displayName)}
              </button>
            );
          })}
          {collaborators.length > 4 && (
            <span className="pl-2 pr-1 text-[10px] text-[var(--text-muted)]">
              +{collaborators.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Right-edge vertical utility dock (expands on hover like reference) */}
      <div className="flex flex-col gap-0.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/95 p-1 shadow-2xl backdrop-blur-md">
        {onOpenAiPalette && (
          <button
            type="button"
            onClick={onOpenAiPalette}
            title="AI Assistant (⌘K)"
            aria-label="AI Assistant"
            className={dockBtn(aiOpen)}
          >
            AI
          </button>
        )}

        {onOpenSands && (
          <button
            type="button"
            onClick={onOpenSands}
            title="Sands of Time (Record & Replay)"
            aria-label="Sands of Time"
            className={`relative ${dockBtn(sandsOpen)}`}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-4 w-4 ${sandsCount > 0 && !sandsOpen ? "text-amber-400" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3h12M6 21h12M8 3v4l4 5-4 5v4M16 3v4l-4 5 4 5v4" />
            </svg>
            {sandsCount > 0 && (
              <span className="absolute -right-1 -bottom-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-amber-400 px-0.5 text-[9px] font-bold text-black">
                {sandsCount}
              </span>
            )}
          </button>
        )}

        {onOpenSlides && (
          <button
            type="button"
            onClick={onOpenSlides}
            title="Slides & Present"
            aria-label="Slides"
            className={dockBtn(slidesOpen)}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="12" rx="2" />
              <path d="M8 20h8M12 16v4" />
            </svg>
          </button>
        )}

        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("editor-open-library"))
          }
          title="Library"
          aria-label="Library"
          className={dockBtn(libraryOpen)}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 4h12v16l-6-4-6 4V4Z" />
          </svg>
        </button>

        <div
          className={`flex flex-col gap-0.5 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            hovered ? "max-h-40 opacity-100" : "max-h-0 opacity-0 pointer-events-none"
          }`}
        >
          {onOpenHistory && (
            <button
              type="button"
              onClick={onOpenHistory}
              title="Version History"
              aria-label="Version History"
              className={dockBtn(historyOpen)}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
            </button>
          )}

          {onOpenDiagramCode && (
            <button
              type="button"
              onClick={onOpenDiagramCode}
              title="Diagram Code (Mermaid)"
              aria-label="Diagram Code"
              className={dockBtn(codeOpen)}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="m8 9-4 3 4 3M16 9l4 3-4 3M13 6l-2 12" />
              </svg>
            </button>
          )}

          {onOpenMcp && (
            <button
              type="button"
              onClick={onOpenMcp}
              title="Connect MCP Agent"
              aria-label="Connect MCP Agent"
              className={dockBtn(false)}
            >
              <span className="font-mono text-[10px]">MCP</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("editor-help-open"))}
            title="Help & Shortcuts"
            aria-label="Help & Shortcuts"
            className={dockBtn(false)}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M9.5 9.5a2.5 2.5 0 0 1 5 .7c0 1.8-2.5 2.1-2.5 3.8M12 17.5h.01" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
