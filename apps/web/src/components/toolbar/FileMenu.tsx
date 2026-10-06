"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
              try {
                exportElementsToSvg(scene.getElements());
                publishImportStatus("SVG exported");
              } catch (error) {
                publishImportStatus(
                  error instanceof Error
                    ? error.message
                    : "Could not export the SVG",
                );
              }
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
              try {
                downloadExcalidrawFile(
                  selectedElements,
                  getCurrentViewport(),
                  "selection.excalidraw",
                );
                publishImportStatus("Selection exported");
              } catch (error) {
                publishImportStatus(
                  error instanceof Error ? error.message : "Could not export selection",
                );
              }
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
              try {
                exportElementsToSvg(selectedElements);
                publishImportStatus("Selection exported as SVG");
              } catch (error) {
                publishImportStatus(
                  error instanceof Error ? error.message : "Could not export selection",
                );
              }
              setOpen(false);
            }}
            className="w-full rounded-md px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Export selection as SVG
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
