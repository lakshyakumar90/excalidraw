"use client";

import { useState } from "react";
import type { SlideDescriptor } from "@repo/engine";

export interface SlidesFilmstripProps {
  open: boolean;
  slides: readonly SlideDescriptor[];
  activeSlideId: string | null;
  onSelectSlide: (slide: SlideDescriptor) => void;
  onReorder: (orderedFrameIds: string[]) => void;
  onAddSlide?: () => void;
  onStartPresent: () => void;
  onClose: () => void;
}

export function SlidesFilmstrip({
  open,
  slides,
  activeSlideId,
  onSelectSlide,
  onReorder,
  onAddSlide,
  onStartPresent,
  onClose,
}: SlidesFilmstripProps) {
  const [dragId, setDragId] = useState<string | null>(null);

  if (!open) return null;

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const ids = slides.map((s) => s.id);
    const fromIdx = ids.indexOf(dragId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, dragId);
    onReorder(ids);
    setDragId(null);
  }

  return (
    <aside
      data-editor-chrome
      aria-label="Slides Filmstrip"
      className="animate-drawer-right fixed bottom-0 right-0 top-0 z-50 flex w-[min(22.5rem,100vw)] flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-3.5 py-2.5">
        <span className="text-xs font-semibold text-[var(--text-primary)]">
          Slides ({slides.length})
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={slides.length === 0}
            onClick={onStartPresent}
            title="Start Present Mode (Cmd/Ctrl+Shift+P)"
            className="rounded-lg bg-[var(--accent)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent-fg)] transition hover:bg-[var(--accent-hover)] disabled:opacity-40"
          >
            Present
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Slides"
            className="rounded-lg px-1.5 py-0.5 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-surface)]"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {slides.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-subtle)] p-4 text-center text-xs text-[var(--text-muted)]">
            Draw a Frame on the canvas or click &ldquo;+ Add Slide&rdquo; to build a deck.
          </div>
        ) : (
          slides.map((slide, idx) => {
            const active = slide.id === activeSlideId;
            return (
              <div
                key={slide.id}
                draggable
                onDragStart={() => setDragId(slide.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(slide.id)}
                onClick={() => onSelectSlide(slide)}
                className={`cursor-pointer rounded-xl border p-2.5 transition-colors ${
                  active
                    ? "border-[var(--accent)] bg-[var(--accent)]/15"
                    : "border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-soft)]"
                }`}
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-mono text-[var(--text-muted)]">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <span className="truncate pl-2 font-medium text-[var(--text-primary)]">
                    {slide.title}
                  </span>
                </div>
                <div className="mt-1.5 flex aspect-video items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[10px] font-mono text-[var(--text-muted)]">
                  {Math.round(slide.width)} × {Math.round(slide.height)}
                </div>
              </div>
            );
          })
        )}
      </div>

      {onAddSlide && (
        <div className="border-t border-[var(--border-subtle)] p-2.5">
          <button
            type="button"
            onClick={onAddSlide}
            className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
          >
            + Add Slide Frame
          </button>
        </div>
      )}
    </aside>
  );
}
