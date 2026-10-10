"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { MAX_ZOOM, MIN_ZOOM } from "@repo/common";
import { zoomAtPoint } from "@repo/engine";
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

export function CanvasControls({ readOnly = false }: { readOnly?: boolean }) {
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

  return (
    <>
      <div className="editor-bottom-dock fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-50 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-1 rounded-xl border border-neutral-200 bg-white/95 p-1 text-neutral-800 shadow-sm backdrop-blur">
        <div
          role="group"
          aria-label="Canvas zoom"
          onClickCapture={() =>
            window.dispatchEvent(new Event("canvas-user-interaction"))
          }
          className="flex h-10 items-center"
        >
          <button
            type="button"
            aria-label="Zoom out"
            title="Zoom out"
            disabled={viewport.zoom <= MIN_ZOOM}
            onClick={() => changeZoom(1 / 1.2)}
            className="grid h-9 w-9 place-items-center rounded-lg text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:text-neutral-300 disabled:hover:bg-transparent"
          >
            <Icon name="minus" />
          </button>
          <span
            aria-live="polite"
            className="min-w-12 px-1 text-center text-xs font-semibold tabular-nums"
          >
            {Math.round(viewport.zoom * 100)}%
          </span>
          <button
            type="button"
            aria-label="Zoom in"
            title="Zoom in"
            disabled={viewport.zoom >= MAX_ZOOM}
            onClick={() => changeZoom(1.2)}
            className="grid h-9 w-9 place-items-center rounded-lg text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:text-neutral-300 disabled:hover:bg-transparent"
          >
            <Icon name="plus" />
          </button>
        </div>
        {!readOnly && (
          <span aria-hidden="true" className="h-6 w-px bg-neutral-200" />
        )}
        {!readOnly && (
          <div
            role="group"
            aria-label="Undo and redo"
            className="flex h-9 items-center"
          >
            <button
              type="button"
              aria-label="Undo"
              title="Undo (Ctrl/⌘+Z)"
              disabled={!history.canUndo}
              onClick={() => commitUndoRedo(historyStore.undo(), "undo")}
              className="grid h-9 w-9 place-items-center rounded-lg text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:text-neutral-300 disabled:hover:bg-transparent"
            >
              <Icon name="undo" />
            </button>
            <button
              type="button"
              aria-label="Redo"
              title="Redo (Ctrl/⌘+Shift+Z)"
              disabled={!history.canRedo}
              onClick={() => commitUndoRedo(historyStore.redo(), "redo")}
              className="grid h-9 w-9 place-items-center rounded-lg text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:text-neutral-300 disabled:hover:bg-transparent"
            >
              <Icon name="redo" />
            </button>
          </div>
        )}
        <span aria-hidden="true" className="mx-1 h-6 w-px bg-neutral-200" />
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
          className="grid h-10 w-10 place-items-center rounded-lg text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          ···
        </button>
      </div>

      {helpOpen && <HelpDialog onClose={closeHelp} />}
    </>
  );
}
