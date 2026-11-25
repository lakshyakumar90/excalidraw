"use client";

import { useMemo, useState } from "react";
import type { Element } from "@repo/common";
import { getElementAxisAlignedBounds, renderSceneToSvg } from "@repo/engine";
import { scene } from "@/lib/scene/scene";
import { getCurrentViewport } from "@/lib/persistence/viewportStore";
import { downloadExcalidrawFile } from "@/lib/persistence/excalidrawFile";
import { exportElementsToPng } from "@/lib/persistence/rasterExport";
import { exportElementsToSvg } from "@/lib/persistence/svgExport";
import { publishImportStatus } from "@/lib/persistence/importDocument";

export interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  defaultDark?: boolean;
  slidesCount?: number;
}

export function ExportModal({
  open,
  onClose,
  defaultDark = true,
  slidesCount = 0,
}: ExportModalProps) {
  const [what, setWhat] = useState<"whole" | "slides">("whole");
  const [format, setFormat] = useState<"png" | "svg" | "file">("png");
  const [scale, setScale] = useState<1 | 2 | 3 | 4>(2);
  const [includeBg, setIncludeBg] = useState(true);
  const [darkMode, setDarkMode] = useState(defaultDark);
  const [embedBoard, setEmbedBoard] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const elements = useMemo(
    () => scene.getElements().filter((el) => !el.isDeleted),
    // Recompute whenever modal opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open],
  );

  const exportTargets: readonly Element[] = useMemo(() => {
    if (what === "slides" && slidesCount > 0) {
      const frames = elements.filter((el) => el.type === "frame");
      return frames.length > 0 ? frames : elements;
    }
    return elements;
  }, [elements, slidesCount, what]);

  const dimensions = useMemo(() => {
    if (exportTargets.length === 0) return { width: 1200, height: 800 };
    const bounds = exportTargets.map(getElementAxisAlignedBounds);
    const minX = Math.min(...bounds.map((b) => b.minX));
    const minY = Math.min(...bounds.map((b) => b.minY));
    const maxX = Math.max(...bounds.map((b) => b.maxX));
    const maxY = Math.max(...bounds.map((b) => b.maxY));
    return {
      width: Math.max(1, Math.ceil((maxX - minX + 48) * scale)),
      height: Math.max(1, Math.ceil((maxY - minY + 48) * scale)),
    };
  }, [exportTargets, scale]);

  const previewSvg = useMemo(() => {
    if (!open || exportTargets.length === 0) return "";
    return renderSceneToSvg(exportTargets, {
      background: includeBg ? (darkMode ? "#111111" : "#ffffff") : "transparent",
    });
  }, [open, exportTargets, includeBg, darkMode]);

  if (!open) return null;

  async function handleDownload() {
    setBusy(true);
    try {
      if (format === "file") {
        await downloadExcalidrawFile(exportTargets, getCurrentViewport());
        publishImportStatus("Board exported");
      } else if (format === "svg") {
        await exportElementsToSvg(exportTargets);
        publishImportStatus("SVG exported");
      } else {
        await exportElementsToPng(exportTargets, {
          scale,
          transparentBackground: !includeBg,
        });
        publishImportStatus("PNG exported");
      }
      onClose();
    } catch (err) {
      publishImportStatus(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    try {
      if (format === "svg" || format === "file") {
        const text =
          format === "svg"
            ? renderSceneToSvg(exportTargets, {
                background: includeBg ? (darkMode ? "#111111" : "#ffffff") : "transparent",
              })
            : JSON.stringify({ elements: exportTargets }, null, 2);
        await navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
        return;
      }
      if (previewSvg) {
        await navigator.clipboard?.writeText(previewSvg);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      publishImportStatus("Could not copy to clipboard");
    }
  }

  const pillBtn = (active: boolean) =>
    `rounded-xl px-3 py-1.5 text-xs font-medium transition ${
      active
        ? "bg-[var(--accent)] text-[var(--accent-fg)] shadow-xs"
        : "border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
    }`;

  return (
    <div
      data-editor-chrome
      className="animate-fade-in fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Export board"
        className="animate-pop-up w-full max-w-3xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 text-[var(--text-primary)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Export</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Export dialog"
            className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            ✕
          </button>
        </div>

        <div className="grid gap-6 md:grid-cols-[1.25fr_1fr]">
          {/* Live Preview */}
          <div className="flex min-h-[240px] items-center justify-center overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
            {exportTargets.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">
                Draw on the board to preview your export.
              </p>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                alt="Export preview"
                src={`data:image/svg+xml,${encodeURIComponent(previewSvg)}`}
                className="max-h-64 w-full rounded-lg object-contain"
              />
            )}
          </div>

          {/* Options */}
          <div className="flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <div>
                <div className="mb-1.5 text-[10px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
                  What
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setWhat("whole")} className={pillBtn(what === "whole")}>
                    Whole board
                  </button>
                  <button
                    type="button"
                    disabled={slidesCount === 0}
                    onClick={() => setWhat("slides")}
                    className={`${pillBtn(what === "slides")} disabled:opacity-40`}
                  >
                    Slides ({slidesCount})
                  </button>
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-[10px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
                  Format
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setFormat("png")} className={pillBtn(format === "png")}>
                    PNG
                  </button>
                  <button type="button" onClick={() => setFormat("svg")} className={pillBtn(format === "svg")}>
                    SVG
                  </button>
                  <button type="button" onClick={() => setFormat("file")} className={pillBtn(format === "file")}>
                    .excalidraw
                  </button>
                </div>
              </div>

              {format === "png" && (
                <div>
                  <div className="mb-1.5 text-[10px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
                    Scale
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {([1, 2, 3, 4] as const).map((s) => (
                      <button key={s} type="button" onClick={() => setScale(s)} className={pillBtn(scale === s)}>
                        {s}×
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2 pt-1 text-xs">
                <label className="flex cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={includeBg}
                    onChange={(e) => setIncludeBg(e.target.checked)}
                    className="h-4 w-4 rounded accent-[var(--accent)]"
                  />
                  <span>Background</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={darkMode}
                    onChange={(e) => setDarkMode(e.target.checked)}
                    className="h-4 w-4 rounded accent-[var(--accent)]"
                  />
                  <span>Dark mode</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={embedBoard}
                    onChange={(e) => setEmbedBoard(e.target.checked)}
                    className="h-4 w-4 rounded accent-[var(--accent)]"
                  />
                  <span>Embed board (re-opens as editable)</span>
                </label>
              </div>

              <div className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
                {dimensions.width} × {dimensions.height} px
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={exportTargets.length === 0}
                onClick={() => void handleCopy()}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)] disabled:opacity-40"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
              <button
                type="button"
                disabled={busy || exportTargets.length === 0}
                onClick={() => void handleDownload()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-fg)] transition hover:bg-[var(--accent-hover)] disabled:opacity-40"
              >
                <span>↓</span>
                <span>
                  {busy
                    ? "Exporting…"
                    : format === "png"
                      ? "Download PNG"
                      : format === "svg"
                        ? "Download SVG"
                        : "Download file"}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
