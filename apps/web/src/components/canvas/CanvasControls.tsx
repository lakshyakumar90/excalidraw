"use client";

import { useRef, useState, useSyncExternalStore } from "react";
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
  const helpButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeHelp = () => setHelpOpen(false);

  const changeZoom = (factor: number) => {
    const current = getCurrentViewport();
    const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    setCurrentViewport(zoomAtPoint(current, center, current.zoom * factor));
  };

  return (
    <>
      <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl border border-black/10 bg-white/95 p-1.5 text-neutral-800 shadow-lg backdrop-blur">
        <div
          role="group"
          aria-label="Canvas zoom"
          onClickCapture={() =>
            window.dispatchEvent(new Event("canvas-user-interaction"))
          }
          className="flex h-9 items-center"
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
            className="min-w-14 px-1 text-center text-xs font-semibold tabular-nums"
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
      </div>

      <button
        ref={helpButtonRef}
        type="button"
        aria-label="Help and keyboard shortcuts"
        title="Help and keyboard shortcuts"
        onClick={() => setHelpOpen(true)}
        className="fixed bottom-4 right-4 z-50 grid h-11 w-11 place-items-center rounded-full border border-black/10 bg-white text-neutral-700 shadow-lg transition hover:bg-neutral-50 hover:text-neutral-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <Icon name="help" />
      </button>
      {helpOpen && <HelpDialog onClose={closeHelp} />}
    </>
  );
}
