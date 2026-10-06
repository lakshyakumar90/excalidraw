"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { Element } from "@repo/common";
import { scene } from "@/lib/scene/scene";
import { selectionStore } from "@/lib/selection/selectionStore";
import { getCurrentViewport } from "@/lib/persistence/viewportStore";
import { downloadExcalidrawFile } from "@/lib/persistence/excalidrawFile";
import {
  applyImportedDocument,
  publishImportStatus,
  readExcalidrawFile,
} from "@/lib/persistence/importDocument";
import { exportElementsToPng } from "@/lib/persistence/rasterExport";
import { exportElementsToSvg } from "@/lib/persistence/svgExport";

export function FileMenu() {
  const [open, setOpen] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [pngScale, setPngScale] = useState(2);
  const [transparentBackground, setTransparentBackground] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedIds = useSyncExternalStore(
    selectionStore.subscribe,
    selectionStore.getSnapshot,
    selectionStore.getSnapshot,
  );
  const selectedElements = [...selectedIds]
    .map((id) => scene.getElement(id))
    .filter(
      (element): element is Element => !!element && !element.isDeleted,
    );

  useEffect(() => {
    setPortalReady(true);
    const onStatus = (event: Event) => {
      const statusEvent = event as CustomEvent<string | null>;
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
      setImportStatus(statusEvent.detail);
      if (statusEvent.detail) {
        statusTimerRef.current = setTimeout(() => setImportStatus(null), 3000);
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("excalidraw-import-status", onStatus);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("excalidraw-import-status", onStatus);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    };
  }, []);

  const importFile = async (file: File) => {
    try {
      const document = await readExcalidrawFile(file);
      await applyImportedDocument(document);
      publishImportStatus(`Imported ${file.name}`);
      setOpen(false);
    } catch (error) {
      publishImportStatus(
        error instanceof Error ? error.message : "Could not import this drawing",
      );
    }
  };

  return (
    <div ref={wrapperRef} className="relative order-last ml-auto shrink-0">
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
        aria-label="More options"
        title="More options"
        className="grid h-10 w-10 place-items-center rounded-md text-neutral-700 transition hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="File actions"
          className="absolute right-0 top-[calc(100%+8px)] z-[60] min-w-48 rounded-lg border border-neutral-200 bg-white p-1.5 shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void downloadExcalidrawFile(scene.getElements(), getCurrentViewport())
                .then(() => publishImportStatus("Drawing exported"))
                .catch((error: unknown) =>
                  publishImportStatus(
                    error instanceof Error ? error.message : "Could not export this drawing",
                  ),
                );
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
          <div className="my-1 border-t border-neutral-100" />
          <label className="flex items-center justify-between gap-4 px-3 py-2 text-sm text-neutral-700">
            PNG scale
            <select
              aria-label="PNG scale"
              value={pngScale}
              onChange={(event) => setPngScale(Number(event.target.value))}
              className="rounded border border-neutral-200 bg-white px-2 py-1 text-sm"
            >
              <option value={1}>1×</option>
              <option value={2}>2×</option>
              <option value={3}>3×</option>
            </select>
          </label>
          <label className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={transparentBackground}
              onChange={(event) =>
                setTransparentBackground(event.target.checked)
              }
            />
            Transparent background
          </label>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void exportElementsToPng(scene.getElements(), {
                scale: pngScale,
                transparentBackground,
              })
                .then(() => publishImportStatus("PNG exported"))
                .catch((error: unknown) =>
                  publishImportStatus(
                    error instanceof Error
                      ? error.message
                      : "Could not export the PNG",
                  ),
                );
              setOpen(false);
            }}
            className="w-full rounded-md px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Export PNG
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void exportElementsToSvg(scene.getElements())
                .then(() => publishImportStatus("SVG exported"))
                .catch((error: unknown) =>
                  publishImportStatus(
                    error instanceof Error
                      ? error.message
                      : "Could not export the SVG",
                  ),
                );
              setOpen(false);
            }}
            className="w-full rounded-md px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Export SVG
          </button>
          <div className="my-1 border-t border-neutral-100" />
          <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            Selection only ({selectedElements.length})
          </div>
          <button
            type="button"
            role="menuitem"
            disabled={selectedElements.length === 0}
            onClick={() => {
              void downloadExcalidrawFile(
                  selectedElements,
                  getCurrentViewport(),
                  "selection.excalidraw",
                )
                .then(() => publishImportStatus("Selection exported"))
                .catch((error: unknown) =>
                  publishImportStatus(
                    error instanceof Error ? error.message : "Could not export selection",
                  ),
                );
              setOpen(false);
            }}
            className="w-full rounded-md px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Export selection as .excalidraw
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={selectedElements.length === 0}
            onClick={() => {
              void exportElementsToPng(selectedElements, {
                scale: pngScale,
                transparentBackground,
              })
                .then(() => publishImportStatus("Selection exported as PNG"))
                .catch((error: unknown) =>
                  publishImportStatus(
                    error instanceof Error ? error.message : "Could not export selection",
                  ),
                );
              setOpen(false);
            }}
            className="w-full rounded-md px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Export selection as PNG
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={selectedElements.length === 0}
            onClick={() => {
              void exportElementsToSvg(selectedElements)
                .then(() => publishImportStatus("Selection exported as SVG"))
                .catch((error: unknown) =>
                  publishImportStatus(
                    error instanceof Error
                      ? error.message
                      : "Could not export selection",
                  ),
                );
              setOpen(false);
            }}
            className="w-full rounded-md px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Export selection as SVG
          </button>
        </div>
      )}
      {portalReady && importStatus && createPortal(
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm text-white shadow-xl"
        >
          {importStatus}
        </div>,
        document.body,
      )}
    </div>
  );
}
