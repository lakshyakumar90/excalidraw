"use client";

import { useState } from "react";
import { scene } from "@/lib/scene/scene";
import { getCurrentViewport } from "@/lib/persistence/viewportStore";
import { downloadExcalidrawFile } from "@/lib/persistence/excalidrawFile";

export function FileMenu() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        className="h-10 rounded-md px-3 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        File
      </button>
      {open && (
        <div
          role="menu"
          aria-label="File actions"
          className="absolute left-0 top-[calc(100%+8px)] z-[60] min-w-48 rounded-lg border border-neutral-200 bg-white p-1.5 shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              downloadExcalidrawFile(scene.getElements(), getCurrentViewport());
              setOpen(false);
            }}
            className="w-full rounded-md px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Export .excalidraw
          </button>
        </div>
      )}
    </div>
  );
}
