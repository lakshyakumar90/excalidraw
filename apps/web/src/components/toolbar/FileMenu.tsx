"use client";

import { useEffect, useRef, useState } from "react";
import { scene } from "@/lib/scene/scene";
import { getCurrentViewport } from "@/lib/persistence/viewportStore";
import { downloadExcalidrawFile } from "@/lib/persistence/excalidrawFile";
import {
  applyImportedDocument,
  publishImportStatus,
  readExcalidrawFile,
} from "@/lib/persistence/importDocument";

export function FileMenu() {
  const [open, setOpen] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onStatus = (event: Event) => {
      const statusEvent = event as CustomEvent<string | null>;
      setImportStatus(statusEvent.detail);
    };
    window.addEventListener("excalidraw-import-status", onStatus);
    return () => window.removeEventListener("excalidraw-import-status", onStatus);
  }, []);

  const importFile = async (file: File) => {
    try {
      const document = await readExcalidrawFile(file);
      applyImportedDocument(document);
      publishImportStatus(`Imported ${file.name}`);
      setOpen(false);
    } catch (error) {
      publishImportStatus(
        error instanceof Error ? error.message : "Could not import this drawing",
      );
    }
  };

  return (
    <div className="relative shrink-0">
      <input
        ref={fileInputRef}
        type="file"
        accept=".excalidraw,.json,application/json"
        className="hidden"
        aria-label="Import Excalidraw file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void importFile(file);
          event.currentTarget.value = "";
        }}
      />
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
          <button
            type="button"
            role="menuitem"
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-md px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Import .excalidraw
          </button>
        </div>
      )}
      {importStatus && (
        <div
          role="status"
          className="absolute left-0 top-[calc(100%+12px)] z-[70] min-w-48 rounded-md bg-neutral-900 px-3 py-2 text-xs text-white shadow-lg"
        >
          {importStatus}
        </div>
      )}
    </div>
  );
}
