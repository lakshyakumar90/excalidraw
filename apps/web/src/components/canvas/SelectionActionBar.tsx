"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BOARD_PRESET_LIST, type Element } from "@repo/common";
import { scene } from "@/lib/scene/scene";
import { selectionStore } from "@/lib/selection/selectionStore";
import { styleStore, type CurrentItemStyle } from "@/lib/styles/styleStore";
import { eyedropperStore } from "@/lib/styles/eyedropperStore";
import { colorHistoryStore } from "@/lib/styles/colorHistoryStore";
import { historyStore } from "@/lib/history/historyStore";
import { commitHistoryEntry } from "@/lib/sync/commits";

const EMPTY_SELECTION: ReadonlySet<string> = new Set();

const SWATCH_COLORS = [
  "#1e1e1e",
  "#868e96",
  "#ffffff",
  "#e03131",
  "#f76707",
  "#f2c94c",
  "#2f9e44",
  "#12b886",
  "#228be6",
  "#7950f2",
  "#e64980",
];

type OpenMenu = "stroke" | "fill" | "shape" | "layers" | null;

export function SelectionActionBar({
  readOnly = false,
  onOpenAiClean,
}: {
  readOnly?: boolean;
  onOpenAiClean?: () => void;
}) {
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  const selectedIds = useSyncExternalStore(
    selectionStore.subscribe,
    selectionStore.getSnapshot,
    () => EMPTY_SELECTION,
  );
  const sceneRev = useSyncExternalStore(
    scene.subscribe.bind(scene),
    scene.getSnapshot.bind(scene),
    scene.getSnapshot.bind(scene),
  );
  const style = useSyncExternalStore(
    styleStore.subscribe,
    styleStore.getSnapshot,
    styleStore.getSnapshot,
  );
  void sceneRev;

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpenMenu(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const selectedElements = [...selectedIds]
    .map((id) => scene.getElement(id))
    .filter((el): el is Element => el !== undefined && !el.isDeleted);

  if (readOnly || selectedElements.length === 0) return null;

  const first = selectedElements[0]!;
  const currentStroke = first.strokeColor ?? style.strokeColor;
  const currentBg = first.backgroundColor ?? style.backgroundColor;
  const currentFillStyle = first.fillStyle ?? style.fillStyle;
  const currentStrokeWidth = first.strokeWidth ?? style.strokeWidth;
  const currentStrokeStyle = first.strokeStyle ?? style.strokeStyle;
  const currentRoughness = first.roughness ?? style.roughness;
  const currentEdge = first.edgeStyle ?? style.edgeStyle;
  const currentOpacity = first.opacity ?? style.opacity;

  function updateStyle<K extends keyof CurrentItemStyle>(
    key: K,
    value: CurrentItemStyle[K],
  ) {
    const changes: Partial<CurrentItemStyle> = { [key]: value };
    if (key === "backgroundColor" && value !== "transparent" && currentFillStyle === "none") {
      changes.fillStyle = "solid";
    }
    if (key === "fillStyle" && value === "none") {
      changes.backgroundColor = "transparent";
    }
    const { changes: entryChanges } = historyStore.commitUpdate(() => {
      styleStore.update(changes);
      for (const el of selectedElements) {
        scene.mutateElement(el.id, changes);
      }
    });
    commitHistoryEntry(entryChanges, "local");
  }

  function deleteSelected() {
    const { changes } = historyStore.commitUpdate(() => {
      for (const el of selectedElements) {
        scene.removeElement(el.id);
      }
      selectionStore.clear();
    });
    commitHistoryEntry(changes, "local");
    setOpenMenu(null);
  }

  function reorder(action: "front" | "forward" | "backward" | "back") {
    const { changes } = historyStore.commitUpdate(() => {
      scene.reorderElements(selectedIds, action);
    });
    commitHistoryEntry(changes, "local");
    setOpenMenu(null);
  }

  const toggleMenu = (menu: Exclude<OpenMenu, null>) =>
    setOpenMenu((prev) => (prev === menu ? null : menu));

  return (
    <div
      ref={barRef}
      data-editor-chrome
      role="toolbar"
      aria-label="Selection actions"
      className="animate-pop-up fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-40 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/95 p-1 text-xs text-[var(--text-primary)] shadow-2xl backdrop-blur-md"
    >
      {/* Stroke color dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => toggleMenu("stroke")}
          aria-expanded={openMenu === "stroke"}
          title="Stroke color"
          className={`flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium transition ${
            openMenu === "stroke"
              ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
              : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          }`}
        >
          <span
            className="h-3.5 w-3.5 rounded-full border border-white/25"
            style={{ backgroundColor: currentStroke }}
          />
          <span className="hidden sm:inline">Stroke</span>
        </button>

        {openMenu === "stroke" && (
          <div className="animate-pop-up absolute bottom-[calc(100%+10px)] left-0 w-56 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[var(--text-muted)]">Stroke color</span>
              <div className="flex items-center gap-1.5">
                <input
                  aria-label="Stroke color picker"
                  type="color"
                  value={currentStroke}
                  onChange={(e) => {
                    updateStyle("strokeColor", e.target.value);
                    colorHistoryStore.add(e.target.value);
                  }}
                  className="h-6 w-7 cursor-pointer rounded border border-[var(--border-subtle)] bg-transparent p-0.5"
                />
                <button
                  type="button"
                  title="Pick from canvas"
                  onClick={() => {
                    eyedropperStore.activate("strokeColor");
                    setOpenMenu(null);
                  }}
                  className="rounded-md border border-[var(--border-subtle)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                >
                  Pick
                </button>
              </div>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {SWATCH_COLORS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  aria-label={`Stroke ${hex}`}
                  onClick={() => {
                    updateStyle("strokeColor", hex);
                    colorHistoryStore.add(hex);
                  }}
                  className={`h-6 w-6 rounded-md border transition hover:scale-110 ${
                    currentStroke.toLowerCase() === hex
                      ? "border-[var(--accent)] ring-1 ring-[var(--accent)]"
                      : "border-[var(--border-subtle)]"
                  }`}
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Fill color & style dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => toggleMenu("fill")}
          aria-expanded={openMenu === "fill"}
          title="Fill & background"
          className={`flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium transition ${
            openMenu === "fill"
              ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
              : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          }`}
        >
          <span
            className="h-3.5 w-3.5 rounded border border-[var(--border-soft)]"
            style={{
              backgroundColor: currentBg === "transparent" ? "transparent" : currentBg,
            }}
          />
          <span className="hidden sm:inline">Fill</span>
        </button>

        {openMenu === "fill" && (
          <div className="animate-pop-up absolute bottom-[calc(100%+10px)] left-0 w-56 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[var(--text-muted)]">Background</span>
              <button
                type="button"
                onClick={() => updateStyle("backgroundColor", "transparent")}
                className="rounded-md border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                Transparent
              </button>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {SWATCH_COLORS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  aria-label={`Fill ${hex}`}
                  onClick={() => {
                    updateStyle("backgroundColor", hex);
                    colorHistoryStore.add(hex);
                  }}
                  className={`h-6 w-6 rounded-md border transition hover:scale-110 ${
                    currentBg.toLowerCase() === hex
                      ? "border-[var(--accent)] ring-1 ring-[var(--accent)]"
                      : "border-[var(--border-subtle)]"
                  }`}
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
            <div className="mt-3 border-t border-[var(--border-subtle)] pt-2.5">
              <div className="mb-1.5 text-[11px] font-semibold text-[var(--text-muted)]">Fill style</div>
              <div className="grid grid-cols-4 gap-1">
                {(
                  [
                    ["none", "None"],
                    ["hachure", "Hatch"],
                    ["cross-hatch", "Cross"],
                    ["solid", "Solid"],
                  ] as const
                ).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => updateStyle("fillStyle", val)}
                    className={`rounded-lg py-1 text-[10px] font-medium transition ${
                      currentFillStyle === val
                        ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                        : "bg-[var(--bg-surface)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Shape / Stroke / Edges / Opacity dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => toggleMenu("shape")}
          aria-expanded={openMenu === "shape"}
          title="Stroke width, style, edges & opacity"
          className={`flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-medium transition ${
            openMenu === "shape"
              ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
              : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          }`}
        >
          <span className="font-mono">{currentStrokeWidth}px</span>
          <span>·</span>
          <span>{currentEdge === "rounded" ? "Round" : "Sharp"}</span>
        </button>

        {openMenu === "shape" && (
          <div className="animate-pop-up absolute bottom-[calc(100%+10px)] left-1/2 w-60 -translate-x-1/2 space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-2xl">
            <div>
              <div className="mb-1.5 text-[11px] font-semibold text-[var(--text-muted)]">Stroke width</div>
              <div className="grid grid-cols-3 gap-1">
                {([1, 2, 4] as const).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => updateStyle("strokeWidth", w)}
                    className={`rounded-lg py-1 text-[11px] font-medium transition ${
                      currentStrokeWidth === w
                        ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                        : "bg-[var(--bg-surface)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {w === 1 ? "Thin" : w === 2 ? "Med" : "Bold"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-[11px] font-semibold text-[var(--text-muted)]">Stroke style</div>
              <div className="grid grid-cols-3 gap-1">
                {(["solid", "dashed", "dotted"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => updateStyle("strokeStyle", s)}
                    className={`rounded-lg py-1 text-[11px] font-medium capitalize transition ${
                      currentStrokeStyle === s
                        ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                        : "bg-[var(--bg-surface)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="mb-1.5 text-[11px] font-semibold text-[var(--text-muted)]">Sloppiness</div>
                <div className="grid grid-cols-3 gap-1">
                  {([0, 1, 2] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => updateStyle("roughness", r)}
                      className={`rounded-lg py-1 text-[10px] font-medium transition ${
                        currentRoughness === r
                          ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                          : "bg-[var(--bg-surface)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      {r === 0 ? "0" : r === 1 ? "1" : "2"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-[11px] font-semibold text-[var(--text-muted)]">Edges</div>
                <div className="grid grid-cols-2 gap-1">
                  {(["sharp", "rounded"] as const).map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => updateStyle("edgeStyle", e)}
                      className={`rounded-lg py-1 text-[10px] font-medium capitalize transition ${
                        currentEdge === e
                          ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                          : "bg-[var(--bg-surface)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      {e === "sharp" ? "Sharp" : "Round"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {selectedElements.some((item) => item.type === "text") && (
              <div>
                <div className="mb-1 text-[11px] font-semibold text-[var(--text-muted)]">Font</div>
                <select
                  aria-label="Font family"
                  value={selectedElements.find((item) => item.type === "text")?.fontFamily ?? ""}
                  onChange={(event) => {
                    const fontFamily = event.target.value;
                    if (!fontFamily) return;
                    const { changes } = historyStore.commitUpdate(() => {
                      for (const item of selectedElements)
                        if (item.type === "text") scene.mutateElement(item.id, { fontFamily });
                    });
                    commitHistoryEntry(changes, "local");
                  }}
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2 py-1 text-xs text-[var(--text-primary)]"
                >
                  <option value="">Current font</option>
                  {BOARD_PRESET_LIST.map((preset) => (
                    <option key={preset.id} value={preset.fontFamily}>{preset.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span className="font-semibold text-[var(--text-muted)]">Opacity</span>
                <span className="font-mono tabular-nums text-[var(--text-primary)]">{currentOpacity}%</span>
              </div>
              <input
                aria-label="Opacity"
                type="range"
                min={0}
                max={100}
                step={5}
                value={currentOpacity}
                onChange={(e) => updateStyle("opacity", Number(e.target.value))}
                className="w-full accent-[var(--accent)]"
              />
            </div>
          </div>
        )}
      </div>

      <span aria-hidden="true" className="h-4 w-px bg-[var(--border-subtle)]" />

      {/* Layers / Arrange dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => toggleMenu("layers")}
          aria-expanded={openMenu === "layers"}
          title="Layer order"
          aria-label="Layer order"
          className={`grid h-8 w-8 place-items-center rounded-lg transition ${
            openMenu === "layers"
              ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
              : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          }`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z" />
            <path d="m3 12 9 4.5 9-4.5" />
            <path d="m3 16.5 9 4.5 9-4.5" />
          </svg>
        </button>

        {openMenu === "layers" && (
          <div className="animate-pop-up absolute bottom-[calc(100%+10px)] right-0 grid w-36 gap-0.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-1 shadow-2xl">
            <button type="button" onClick={() => reorder("front")} className="rounded-lg px-2.5 py-1.5 text-left text-[11px] hover:bg-[var(--bg-hover)]">Bring to front</button>
            <button type="button" onClick={() => reorder("forward")} className="rounded-lg px-2.5 py-1.5 text-left text-[11px] hover:bg-[var(--bg-hover)]">Bring forward</button>
            <button type="button" onClick={() => reorder("backward")} className="rounded-lg px-2.5 py-1.5 text-left text-[11px] hover:bg-[var(--bg-hover)]">Send backward</button>
            <button type="button" onClick={() => reorder("back")} className="rounded-lg px-2.5 py-1.5 text-left text-[11px] hover:bg-[var(--bg-hover)]">Send to back</button>
          </div>
        )}
      </div>

      {/* Delete */}
      <button
        type="button"
        onClick={deleteSelected}
        title="Delete selected"
        aria-label="Delete selected"
        className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-muted)] transition hover:bg-rose-500/15 hover:text-rose-400"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18" />
          <path d="M8 6V4h8v2" />
          <path d="M6 6l1 14h10l1-14" />
        </svg>
      </button>

      {/* Clean it / AI */}
      {onOpenAiClean && (
        <button
          type="button"
          onClick={onOpenAiClean}
          className="ml-0.5 flex h-8 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 text-[11px] font-semibold text-[var(--accent-fg)] transition hover:bg-[var(--accent-hover)]"
        >
          <span>✦</span>
          <span>Clean it</span>
        </button>
      )}
    </div>
  );
}
