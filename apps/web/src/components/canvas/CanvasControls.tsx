"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { MAX_ZOOM, MIN_ZOOM } from "@repo/common";
import { getElementAxisAlignedBounds, zoomAtPoint } from "@repo/engine";
import { scene } from "@/lib/scene/scene";
import { historyStore } from "@/lib/history/historyStore";
import { commitUndoRedo } from "@/lib/sync/commits";
import {
  getCurrentViewport,
  setCurrentViewport,
  subscribeViewport,
} from "@/lib/persistence/viewportStore";

import { Icon, HelpDialog } from "./HelpDialog";
const subscribeHistory = historyStore.subscribe.bind(historyStore);
const getHistorySnapshot = historyStore.getSnapshot.bind(historyStore);

export function CanvasControls({ readOnly = false, gridEnabled, onToggleGrid }: {
  readOnly?: boolean;
  gridEnabled: boolean;
  onToggleGrid: () => void;
}) {
  const viewport = useSyncExternalStore(
    subscribeViewport,
    getCurrentViewport,
    getCurrentViewport,
  );
  const history = useSyncExternalStore(
    subscribeHistory,
    getHistorySnapshot,
    getHistorySnapshot,
  );
  const [helpOpen, setHelpOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  const expanded = hovered || zoomMenuOpen;

  const closeHelp = () => setHelpOpen(false);
  useEffect(() => {
    const openHelp = () => setHelpOpen(true);
    window.addEventListener("editor-help-open", openHelp);
    return () => window.removeEventListener("editor-help-open", openHelp);
  }, []);

  const changeZoom = (factor: number) => {
    const current = getCurrentViewport();
    const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    setCurrentViewport(zoomAtPoint(current, center, current.zoom * factor));
  };
  function fitDrawing() {
    const bounds = scene.getRenderableElements().filter((item) => !item.isDeleted).map(getElementAxisAlignedBounds);
    if (!bounds.length) {
      setCurrentViewport({ scrollX: 0, scrollY: 0, zoom: 1 });
      return;
    }
    const minX = Math.min(...bounds.map((item) => item.minX));
    const minY = Math.min(...bounds.map((item) => item.minY));
    const maxX = Math.max(...bounds.map((item) => item.maxX));
    const maxY = Math.max(...bounds.map((item) => item.maxY));
    const width = window.innerWidth;
    const height = window.innerHeight;
    const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, (width - 120) / Math.max(1, maxX - minX),
      (height - 160) / Math.max(1, maxY - minY)));
    setCurrentViewport({
      zoom,
      scrollX: (width - (minX + maxX) * zoom) / 2,
      scrollY: (height - (minY + maxY) * zoom) / 2,
    });
  }

  return (
    <>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="editor-bottom-dock fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 z-40 flex max-w-[calc(100vw-1.5rem)] items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/95 p-1 text-xs text-[var(--text-primary)] shadow-2xl backdrop-blur-md transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
      >
        <div
          role="group"
          aria-label="Canvas zoom"
          onClickCapture={() =>
            window.dispatchEvent(new Event("canvas-user-interaction"))
          }
          className="relative flex h-8 items-center"
        >
          <button
            type="button"
            aria-label="Zoom out"
            title="Zoom out"
            disabled={viewport.zoom <= MIN_ZOOM}
            onClick={() => changeZoom(1 / 1.2)}
            className={`grid h-8 place-items-center rounded-lg text-[var(--text-muted)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent ${
              expanded ? "w-8 opacity-100" : "w-0 overflow-hidden opacity-0 pointer-events-none"
            }`}
          >
            <Icon name="minus" />
          </button>

          <button
            type="button"
            aria-label="Zoom presets"
            aria-expanded={zoomMenuOpen}
            onClick={() => setZoomMenuOpen(!zoomMenuOpen)}
            aria-live="polite"
            className="min-w-11 rounded-lg px-2 py-1 text-center text-xs font-medium tabular-nums text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)]"
          >
            {Math.round(viewport.zoom * 100)}%
          </button>

          {zoomMenuOpen && (
            <div className="animate-pop-up absolute bottom-full left-0 mb-2 grid min-w-32 gap-0.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-1 text-xs shadow-xl">
              {[0.5, 1, 1.5, 2].map((zoom) => (
                <button
                  key={zoom}
                  type="button"
                  className="rounded-lg px-2.5 py-1.5 text-left text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                  onClick={() => { changeZoom(zoom / viewport.zoom); setZoomMenuOpen(false); }}
                >
                  {zoom * 100}%
                </button>
              ))}
              <button
                type="button"
                className="rounded-lg px-2.5 py-1.5 text-left text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                onClick={() => { fitDrawing(); setZoomMenuOpen(false); }}
              >
                Fit to screen
              </button>
            </div>
          )}

          <button
            type="button"
            aria-label="Zoom in"
            title="Zoom in"
            disabled={viewport.zoom >= MAX_ZOOM}
            onClick={() => changeZoom(1.2)}
            className={`grid h-8 place-items-center rounded-lg text-[var(--text-muted)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent ${
              expanded ? "w-8 opacity-100" : "w-0 overflow-hidden opacity-0 pointer-events-none"
            }`}
          >
            <Icon name="plus" />
          </button>
        </div>

        <div
          className={`flex items-center gap-1 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            expanded ? "max-w-[320px] pl-1 opacity-100" : "max-w-0 pl-0 opacity-0 pointer-events-none"
          }`}
        >
          <span aria-hidden="true" className="h-4 w-px shrink-0 bg-[var(--border-subtle)]" />

          <button
            type="button"
            onClick={fitDrawing}
            title="Fit to screen"
            className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            Fit
          </button>

          <button
            type="button"
            aria-pressed={gridEnabled}
            onClick={onToggleGrid}
            title="Toggle canvas dot grid"
            className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
              gridEnabled
                ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            }`}
          >
            Dots
          </button>

          {!readOnly && (
            <>
              <span aria-hidden="true" className="h-4 w-px shrink-0 bg-[var(--border-subtle)]" />
              <div
                role="group"
                aria-label="Undo and redo"
                className="flex h-8 shrink-0 items-center"
              >
                <button
                  type="button"
                  aria-label="Undo"
                  title="Undo (Ctrl/⌘+Z)"
                  disabled={!history.canUndo}
                  onClick={() => commitUndoRedo(historyStore.undo(), "undo")}
                  className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
                >
                  <Icon name="undo" />
                </button>
                <button
                  type="button"
                  aria-label="Redo"
                  title="Redo (Ctrl/⌘+Shift+Z)"
                  disabled={!history.canRedo}
                  onClick={() => commitUndoRedo(historyStore.redo(), "redo")}
                  className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
                >
                  <Icon name="redo" />
                </button>
              </div>
            </>
          )}

          <span aria-hidden="true" className="h-4 w-px shrink-0 bg-[var(--border-subtle)]" />
          <button
            type="button"
            aria-label="More canvas actions"
            aria-haspopup="menu"
            title="More canvas actions"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent("editor-panel-open", { detail: "actions" }),
              );
              window.dispatchEvent(new Event("editor-actions-toggle"));
            }}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="currentColor"
            >
              <circle cx="5" cy="12" r="1.7" />
              <circle cx="12" cy="12" r="1.7" />
              <circle cx="19" cy="12" r="1.7" />
            </svg>
          </button>
        </div>
      </div>

      {helpOpen && <HelpDialog onClose={closeHelp} />}
    </>
  );
}
