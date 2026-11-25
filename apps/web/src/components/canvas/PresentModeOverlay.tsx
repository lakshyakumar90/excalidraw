"use client";

import { useEffect } from "react";
import type { SlideDescriptor } from "@repo/engine";

export interface PresentModeOverlayProps {
  active: boolean;
  slides: readonly SlideDescriptor[];
  currentIndex: number;
  laserActive: boolean;
  onNavigate: (nextIndex: number) => void;
  onToggleLaser: () => void;
  onExit: () => void;
}

/**
 * Fullscreen presentation HUD (`Cmd/Ctrl+Shift+P`). Hides editor chrome,
 * supports Left/Right/Space navigation, Escape to exit, slide counter, and laser toggle.
 */
export function PresentModeOverlay({
  active,
  slides,
  currentIndex,
  laserActive,
  onNavigate,
  onToggleLaser,
  onExit,
}: PresentModeOverlayProps) {
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onExit();
      } else if (
        event.key === "ArrowRight" ||
        event.key === " " ||
        event.key === "PageDown"
      ) {
        event.preventDefault();
        if (currentIndex < slides.length - 1) onNavigate(currentIndex + 1);
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        if (currentIndex > 0) onNavigate(currentIndex - 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, currentIndex, slides.length, onNavigate, onExit]);

  if (!active || slides.length === 0) return null;

  const current = slides[currentIndex];

  return (
    <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/90 px-3 py-1.5 text-xs text-[var(--text-primary)] shadow-2xl backdrop-blur-md">
      <button
        type="button"
        disabled={currentIndex <= 0}
        onClick={() => onNavigate(currentIndex - 1)}
        className="rounded-full px-2.5 py-1 hover:bg-[var(--bg-surface)] disabled:opacity-40"
      >
        ← Prev
      </button>

      <span className="px-2 font-mono text-[11px] text-[var(--text-muted)]">
        <strong className="text-[var(--text-primary)]">{currentIndex + 1}</strong> /{" "}
        {slides.length}
        {current?.title ? ` · ${current.title}` : ""}
      </span>

      <button
        type="button"
        disabled={currentIndex >= slides.length - 1}
        onClick={() => onNavigate(currentIndex + 1)}
        className="rounded-full px-2.5 py-1 hover:bg-[var(--bg-surface)] disabled:opacity-40"
      >
        Next →
      </button>

      <span className="h-4 w-px bg-[var(--border-subtle)]" />

      <button
        type="button"
        onClick={onToggleLaser}
        className={`rounded-full px-2.5 py-1 font-medium ${
          laserActive
            ? "bg-rose-500/20 text-rose-300"
            : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        }`}
      >
        Laser
      </button>

      <button
        type="button"
        onClick={onExit}
        className="rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      >
        Esc
      </button>
    </div>
  );
}
