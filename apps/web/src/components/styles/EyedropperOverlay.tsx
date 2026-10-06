"use client";

import { useSyncExternalStore } from "react";
import { eyedropperStore } from "@/lib/styles/eyedropperStore";

export function EyedropperOverlay() {
  const state = useSyncExternalStore(
    eyedropperStore.subscribe,
    eyedropperStore.getSnapshot,
    eyedropperStore.getSnapshot,
  );

  if (!state.target) return null;

  const targetName = state.target === "strokeColor" ? "stroke" : "background";

  return (
    <div className="pointer-events-none absolute inset-0 z-40">
      <div
        role="status"
        aria-live="polite"
        className="absolute left-1/2 top-20 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-neutral-200 bg-white/95 px-3 py-2 text-xs font-medium text-neutral-700 shadow-md backdrop-blur"
      >
        <span
          aria-hidden="true"
          className="h-3 w-3 rounded-full border border-neutral-300"
          style={{ backgroundColor: state.color ?? "#ffffff" }}
        />
        <span>Pick a {targetName} color · Click to apply · Esc to cancel</span>
      </div>

      {state.point && (
        <>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 drop-shadow"
            style={{ left: state.point.x, top: state.point.y }}
            fill="none"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
          >
            <path d="M12 2v5m0 10v5M2 12h5m10 0h5" />
          </svg>
          <div
            aria-hidden="true"
            className="absolute flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white p-1 shadow-md"
            style={{
              left: state.point.x + 16,
              top: state.point.y + 16,
            }}
          >
            <span
              className="h-5 w-5 rounded border border-black/15"
              style={{ backgroundColor: state.color ?? "#ffffff" }}
            />
            <span className="pr-1 font-mono text-[10px] uppercase text-neutral-700">
              {state.color ?? "—"}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
