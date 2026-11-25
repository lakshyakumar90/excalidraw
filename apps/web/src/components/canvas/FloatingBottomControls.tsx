"use client";

import { useState } from "react";

export interface FloatingBottomControlsProps {
  zoomPercent: number;
  onSetZoom: (zoom: number) => void;
  onFitToScreen: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  gridEnabled: boolean;
  onToggleGrid: () => void;
}

const ZOOM_PRESETS = [50, 75, 100, 125, 150, 200];

export function FloatingBottomControls({
  zoomPercent,
  onSetZoom,
  onFitToScreen,
  onUndo,
  onRedo,
  canUndo = true,
  canRedo = true,
  gridEnabled,
  onToggleGrid,
}: FloatingBottomControlsProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      data-editor-chrome
      className="fixed bottom-4 left-4 z-40 flex items-center gap-1.5"
    >
      {/* Zoom dropdown */}
      <div className="relative">
        <div className="flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/90 px-1.5 py-1 text-xs shadow-sm backdrop-blur-md">
          <button
            type="button"
            onClick={() => onSetZoom(Math.max(0.25, zoomPercent / 100 - 0.1))}
            aria-label="Zoom out"
            className="rounded-full px-2 py-0.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="min-w-[3.25rem] rounded-full px-2 py-0.5 font-mono text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
          >
            {Math.round(zoomPercent)}%
          </button>
          <button
            type="button"
            onClick={() => onSetZoom(Math.min(4, zoomPercent / 100 + 0.1))}
            aria-label="Zoom in"
            className="rounded-full px-2 py-0.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
          >
            +
          </button>
        </div>

        {menuOpen && (
          <div className="absolute bottom-10 left-0 w-36 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-1 text-xs shadow-lg">
            {ZOOM_PRESETS.map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => {
                  onSetZoom(pct / 100);
                  setMenuOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
              >
                <span>{pct}%</span>
                {Math.round(zoomPercent) === pct && (
                  <span className="text-[var(--accent)]">●</span>
                )}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                onFitToScreen();
                setMenuOpen(false);
              }}
              className="mt-0.5 flex w-full items-center justify-between rounded-lg border-t border-[var(--border-subtle)] px-2.5 py-1.5 text-left font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
            >
              <span>Fit to screen</span>
              <kbd className="text-[10px] text-[var(--text-muted)]">⌘0</kbd>
            </button>
          </div>
        )}
      </div>

      {/* Undo / Redo */}
      <div className="flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/90 px-1 py-1 text-xs shadow-sm backdrop-blur-md">
        <button
          type="button"
          disabled={!canUndo}
          onClick={onUndo}
          title="Undo (Cmd/Ctrl+Z)"
          aria-label="Undo"
          className="rounded-full px-2.5 py-0.5 text-[var(--text-primary)] hover:bg-[var(--bg-surface)] disabled:opacity-40"
        >
          ↶
        </button>
        <button
          type="button"
          disabled={!canRedo}
          onClick={onRedo}
          title="Redo (Cmd/Ctrl+Shift+Z)"
          aria-label="Redo"
          className="rounded-full px-2.5 py-0.5 text-[var(--text-primary)] hover:bg-[var(--bg-surface)] disabled:opacity-40"
        >
          ↷
        </button>
      </div>

      {/* Grid toggle */}
      <button
        type="button"
        onClick={onToggleGrid}
        title="Toggle canvas grid"
        className={`rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur-md transition-colors ${
          gridEnabled
            ? "border-[var(--accent)]/50 bg-[var(--accent)]/15 text-[var(--text-primary)]"
            : "border-[var(--border-subtle)] bg-[var(--bg-elevated)]/90 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        }`}
      >
        Grid
      </button>
    </div>
  );
}
