"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MAX_ZOOM, MIN_ZOOM } from "@repo/common";
import { zoomAtPoint } from "@repo/engine";
import { historyStore } from "@/lib/history/historyStore";
import { commitUndoRedo } from "@/lib/sync/commits";
import {
  getCurrentViewport,
  setCurrentViewport,
  subscribeViewport,
} from "@/lib/persistence/viewportStore";

import {
  TOOL_LABELS,
  TOOL_SHORTCUTS,
  TOOL_TYPES,
} from "@/lib/tools/toolDefinitions";

const subscribeHistory = historyStore.subscribe.bind(historyStore);
const getHistorySnapshot = historyStore.getSnapshot.bind(historyStore);

function Icon({
  name,
}: {
  name: "minus" | "plus" | "undo" | "redo" | "help" | "close";
}) {
  const paths = {
    minus: <path d="M5 12h14" />,
    plus: <path d="M12 5v14m-7-7h14" />,
    undo: <path d="M9 14 4 9l5-5M4 9h9a6 6 0 0 1 0 12h-2" />,
    redo: <path d="m15 14 5-5-5-5m5 5h-9a6 6 0 0 0 0 12h2" />,
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.7 9a2.4 2.4 0 1 1 4.1 1.7c-1.1 1-1.8 1.3-1.8 3M12 17h.01" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
  };

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function Shortcut({ children }: { children: string }) {
  return (
    <kbd className="whitespace-nowrap rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 font-mono text-[11px] text-neutral-700 shadow-[0_1px_0_rgba(15,23,42,0.08)]">
      {children}
    </kbd>
  );
}

function ShortcutRow({
  action,
  shortcut,
}: {
  action: string;
  shortcut: string;
}) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-4 border-b border-neutral-100 py-2 last:border-0">
      <span className="text-sm text-neutral-700">{action}</span>
      <Shortcut>{shortcut}</Shortcut>
    </div>
  );
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    dialogRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [
        ...dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-950/45 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        tabIndex={-1}
        className="flex max-h-[min(86vh,52rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white text-neutral-900 shadow-2xl outline-none"
      >
        <header className="flex items-start justify-between gap-5 border-b border-neutral-200 px-6 py-5 sm:px-8">
          <div>
            <h2
              id="help-title"
              className="text-lg font-semibold tracking-tight"
            >
              Canvas guide
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Drawing, selecting, and moving around the canvas.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close help"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <Icon name="close" />
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto px-6 py-5 sm:px-8">
          <div className="grid gap-8 md:grid-cols-2">
            <section aria-labelledby="help-tools">
              <h3 id="help-tools" className="mb-2 text-sm font-semibold">
                Tools
              </h3>
              {TOOL_TYPES.map((type) => (
                <ShortcutRow
                  key={type}
                  action={TOOL_LABELS[type]}
                  shortcut={TOOL_SHORTCUTS[type]}
                />
              ))}
            </section>

            <div className="space-y-8">
              <section aria-labelledby="help-editing">
                <h3 id="help-editing" className="mb-2 text-sm font-semibold">
                  Editing
                </h3>
                <ShortcutRow action="Undo" shortcut="Ctrl / ⌘ + Z" />
                <ShortcutRow action="Redo" shortcut="Ctrl / ⌘ + Shift + Z" />
                <ShortcutRow action="Select all" shortcut="Ctrl / ⌘ + A" />
                <ShortcutRow
                  action="Copy / paste / cut"
                  shortcut="Ctrl / ⌘ + C / V / X"
                />
                <ShortcutRow
                  action="Duplicate selection"
                  shortcut="Ctrl / ⌘ + D"
                />
                <ShortcutRow
                  action="Group / ungroup"
                  shortcut="Ctrl / ⌘ + G / Shift+G"
                />
                <ShortcutRow action="Delete selection" shortcut="Delete" />
                <ShortcutRow action="Cancel / clear selection" shortcut="Esc" />
              </section>

              <section aria-labelledby="help-navigation">
                <h3 id="help-navigation" className="mb-2 text-sm font-semibold">
                  Canvas navigation
                </h3>
                <ShortcutRow
                  action="Zoom in / out"
                  shortcut="Ctrl / ⌘ + + / −"
                />
                <ShortcutRow action="Reset zoom" shortcut="Ctrl / ⌘ + 0" />
                <ShortcutRow
                  action="Pan temporarily"
                  shortcut="Hold Space + drag"
                />
                <ShortcutRow
                  action="Move selected elements"
                  shortcut="Arrow keys"
                />
                <p className="pt-3 text-xs leading-5 text-neutral-500">
                  Use the Hand tool to pan the canvas. With Select active, click
                  an element to select it; Alt-click cycles through overlapping
                  elements. Drag on empty canvas to select multiple elements.
                </p>
              </section>
            </div>
          </div>
        </div>
        <footer className="border-t border-neutral-200 px-6 py-3 text-xs text-neutral-500 sm:px-8">
          Shortcuts work when the canvas is active. Ctrl shortcuts also accept ⌘
          on Mac.
        </footer>
      </div>
    </div>
  );
}

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
          onClick={() =>
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
