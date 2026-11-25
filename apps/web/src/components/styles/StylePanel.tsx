"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { BOARD_PRESET_LIST, type Element } from "@repo/common";
import { ColorPicker } from "@/components/styles/ColorPicker";
import { toolManager } from "@/lib/tools/toolManager";
import { scene } from "@/lib/scene/scene";
import { selectionStore } from "@/lib/selection/selectionStore";
import { styleStore, type CurrentItemStyle } from "@/lib/styles/styleStore";
import { eyedropperStore } from "@/lib/styles/eyedropperStore";
import { colorHistoryStore } from "@/lib/styles/colorHistoryStore";
import { historyStore } from "@/lib/history/historyStore";
import { commitHistoryEntry } from "@/lib/sync/commits";
import { setTextFontFamily } from "@/lib/selection/textFont";

import { Section, Field, ChoiceGroup } from "./StyleFields";

const EMPTY_SELECTION: ReadonlySet<string> = new Set();
const EMPTY_RECENT_COLORS: readonly string[] = [];

const TOOL_NAMES: Record<string, string> = {
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  diamond: "Diamond",
  line: "Line",
  multiPointLine: "Multi-point line",
  arrow: "Arrow",
  "curved-line": "Curve",
  freedraw: "Pencil",
};

const Z_ORDER_ACTIONS = [
  { action: "back" as const, label: "Send to back" },
  { action: "backward" as const, label: "Send backward" },
  { action: "forward" as const, label: "Bring forward" },
  { action: "front" as const, label: "Bring to front" },
];

export function StylePanel() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  useEffect(() => {
    const close = (event: Event) => {
      if (
        matchMedia("(max-width:1199px)").matches &&
        (event as CustomEvent).detail !== "styles"
      )
        setIsCollapsed(true);
    };
    window.addEventListener("editor-panel-open", close);
    return () => window.removeEventListener("editor-panel-open", close);
  }, []);
  const activeTool = useSyncExternalStore(
    toolManager.subscribe,
    toolManager.getActiveTool.bind(toolManager),
    () => "selection",
  );
  const selectedIds = useSyncExternalStore(
    selectionStore.subscribe,
    selectionStore.getSnapshot,
    () => EMPTY_SELECTION,
  );
  const sceneRevision = useSyncExternalStore(
    scene.subscribe.bind(scene),
    scene.getSnapshot.bind(scene),
    scene.getSnapshot.bind(scene),
  );
  const style = useSyncExternalStore(
    styleStore.subscribe,
    styleStore.getSnapshot,
    styleStore.getSnapshot,
  );
  const activeEyedropperTarget = useSyncExternalStore(
    eyedropperStore.subscribeMode,
    eyedropperStore.getTarget,
    () => null,
  );
  const recentColors = useSyncExternalStore(
    colorHistoryStore.subscribe,
    colorHistoryStore.getSnapshot,
    () => EMPTY_RECENT_COLORS,
  );

  // Read the scene revision so deleted or replaced selected elements update the panel.
  void sceneRevision;
  const selectedCount = [...selectedIds].filter((id) => {
    const element = scene.getElement(id);
    return element !== undefined && !element.isDeleted;
  }).length;
  const selectedElements = [...selectedIds]
    .map((id) => scene.getElement(id))
    .filter(
      (element): element is Element =>
        element !== undefined && !element.isDeleted,
    );
  const isDrawingTool = Object.hasOwn(TOOL_NAMES, activeTool);

  useEffect(() => {
    styleStore.hydrate();
  }, []);

  useEffect(() => {
    const selectedElement = [...selectedIds]
      .map((id) => scene.getElement(id))
      .find(
        (element): element is Element =>
          element !== undefined && !element.isDeleted,
      );

    if (selectedElement) {
      styleStore.loadFromElement(selectedElement);
    }
    // Scene revisions keep the panel in sync if the selected element is changed
    // by another editor action while it remains selected.
  }, [selectedIds, sceneRevision]);

  if (selectedCount === 0 && !isDrawingTool) return null;

  const update = <K extends keyof CurrentItemStyle>(
    key: K,
    value: CurrentItemStyle[K],
  ) => {
    const changes: Partial<CurrentItemStyle> = { [key]: value };
    if (
      key === "backgroundColor" &&
      value !== "transparent" &&
      style.fillStyle === "none"
    ) {
      changes.fillStyle = "solid";
    }
    if (key === "fillStyle" && value === "none") {
      changes.backgroundColor = "transparent";
    }

    const { changes: entryChanges } = historyStore.commitUpdate(() => {
      styleStore.update(changes);
      for (const element of selectedElements) {
        scene.mutateElement(element.id, changes);
      }
    });
    commitHistoryEntry(entryChanges, "local");
  };

  return (
    <aside
      aria-label="Style properties"
      data-collapsed={isCollapsed}
      className={`editor-style-panel fixed z-50 flex flex-col overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/95 text-[var(--text-primary)] backdrop-blur-md ${
        isCollapsed ? "w-auto" : "w-[min(16.5rem,calc(100vw-0.5rem))]"
      }`}
    >
      <header
        className={`flex items-center justify-between gap-3 px-3 ${isCollapsed ? "py-2" : "pb-3 pt-3.5"}`}
      >
        <div className={isCollapsed ? "flex items-center gap-3" : ""}>
          <h2 className="text-sm font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
            Style
          </h2>
          {!isCollapsed && (
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              {selectedCount > 0
                ? `${selectedCount} element${selectedCount === 1 ? "" : "s"} selected`
                : `Defaults for ${TOOL_NAMES[activeTool]}`}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label={
            isCollapsed ? "Expand style panel" : "Collapse style panel"
          }
          aria-expanded={!isCollapsed}
          aria-controls="style-panel-content"
          title={isCollapsed ? "Expand style panel" : "Collapse style panel"}
          onClick={() => {
            setIsCollapsed((collapsed) => !collapsed);
            window.dispatchEvent(
              new CustomEvent("editor-panel-open", { detail: "styles" }),
            );
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            className={`h-4 w-4 transition-transform ${isCollapsed ? "rotate-180" : ""}`}
          >
            <path
              d="m12 4-6 6 6 6"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </header>

      <div
        id="style-panel-content"
        hidden={isCollapsed}
        className="min-h-0 min-w-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto px-3 pb-4 [scrollbar-color:#a1a1aa_transparent] [scrollbar-width:thin]"
      >
        <Section title="Stroke">
          <div className="space-y-2">
            <ColorPicker
              label="Stroke color"
              value={style.strokeColor}
              recentColors={recentColors}
              eyedropperActive={activeEyedropperTarget === "strokeColor"}
              onChange={(color) => update("strokeColor", color)}
              onCommit={colorHistoryStore.add}
              onPickFromCanvas={() => eyedropperStore.activate("strokeColor")}
            />
          </div>
        </Section>

        <Section title="Background">
          <div className="space-y-2">
            <div className="space-y-2">
              <ColorPicker
                label="Background color"
                value={
                  style.backgroundColor === "transparent"
                    ? "#ffffff"
                    : style.backgroundColor
                }
                recentColors={recentColors}
                eyedropperActive={activeEyedropperTarget === "backgroundColor"}
                onChange={(color) => update("backgroundColor", color)}
                onCommit={colorHistoryStore.add}
                onPickFromCanvas={() =>
                  eyedropperStore.activate("backgroundColor")
                }
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-pressed={style.backgroundColor === "transparent"}
                  onClick={() =>
                    update(
                      "backgroundColor",
                      style.backgroundColor === "transparent"
                        ? "#ffffff"
                        : "transparent",
                    )
                  }
                  className="rounded-lg px-2 py-1 text-xs font-medium text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                >
                  {style.backgroundColor === "transparent"
                    ? "Transparent"
                    : "Clear"}
                </button>
              </div>
            </div>
          </div>
        </Section>

        <Section title="Shape">
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-[var(--text-muted)]">Fill</p>
            <ChoiceGroup
              label="Fill style"
              value={style.fillStyle}
              onChange={(value) => update("fillStyle", value)}
              options={[
                {
                  value: "none",
                  label: "No fill",
                  mark: (
                    <span className="h-4 w-4 rounded border border-[var(--border-soft)]" />
                  ),
                },
                {
                  value: "hachure",
                  label: "Hachure fill",
                  mark: <span className="text-sm">▨</span>,
                },
                {
                  value: "cross-hatch",
                  label: "Cross-hatch fill",
                  mark: <span className="text-sm">▦</span>,
                },
                {
                  value: "solid",
                  label: "Solid fill",
                  mark: <span className="h-3.5 w-3.5 rounded-sm bg-current" />,
                },
              ]}
            />
            <p className="pt-1 text-[11px] font-medium text-[var(--text-muted)]">
              Stroke width
            </p>
            <ChoiceGroup
              label="Stroke width"
              value={style.strokeWidth}
              onChange={(value) => update("strokeWidth", value)}
              options={[
                {
                  value: 1,
                  label: "Thin",
                  mark: <span className="h-px w-4 bg-current" />,
                },
                {
                  value: 2,
                  label: "Medium",
                  mark: <span className="h-0.5 w-4 bg-current" />,
                },
                {
                  value: 4,
                  label: "Bold",
                  mark: <span className="h-1 w-4 bg-current" />,
                },
              ]}
            />
            <p className="pt-1 text-[11px] font-medium text-[var(--text-muted)]">
              Stroke style
            </p>
            <ChoiceGroup
              label="Stroke style"
              value={style.strokeStyle}
              onChange={(value) => update("strokeStyle", value)}
              options={[
                {
                  value: "solid",
                  label: "Solid line",
                  mark: <span className="h-0.5 w-5 bg-current" />,
                },
                {
                  value: "dashed",
                  label: "Dashed line",
                  mark: (
                    <span className="w-5 border-t-2 border-dashed border-current" />
                  ),
                },
                {
                  value: "dotted",
                  label: "Dotted line",
                  mark: (
                    <span className="w-5 border-t-2 border-dotted border-current" />
                  ),
                },
              ]}
            />
            <p className="pt-1 text-[11px] font-medium text-[var(--text-muted)]">
              Sloppiness
            </p>
            <ChoiceGroup
              label="Sloppiness"
              value={style.roughness}
              onChange={(value) => update("roughness", value)}
              options={[
                {
                  value: 0,
                  label: "Architect",
                  mark: <span className="text-[10px]">Low</span>,
                },
                {
                  value: 1,
                  label: "Artist",
                  mark: <span className="text-[10px]">Mid</span>,
                },
                {
                  value: 2,
                  label: "Cartoonist",
                  mark: <span className="text-[10px]">High</span>,
                },
              ]}
            />
            <p className="pt-1 text-[11px] font-medium text-[var(--text-muted)]">
              Edges
            </p>
            <ChoiceGroup
              label="Edges"
              value={style.edgeStyle}
              onChange={(value) => update("edgeStyle", value)}
              options={[
                {
                  value: "sharp",
                  label: "Sharp edges",
                  mark: (
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 16 16"
                      className="h-4 w-4"
                      fill="none"
                    >
                      <path
                        d="M3 13V3h10"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      />
                    </svg>
                  ),
                },
                {
                  value: "rounded",
                  label: "Rounded edges",
                  mark: (
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 16 16"
                      className="h-4 w-4"
                      fill="none"
                    >
                      <path
                        d="M3 13V7a4 4 0 0 1 4-4h6"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                    </svg>
                  ),
                },
              ]}
            />
            {selectedElements.some(
              (item) => item.type === "text" || item.type === "sticky",
            ) && (
              <Field label="Font family">
                <select
                  aria-label="Font family"
                  value={
                    selectedElements.find(
                      (item) => item.type === "text" || item.type === "sticky",
                    )?.fontFamily ?? ""
                  }
                  onChange={(event) => {
                    const fontFamily = event.target.value;
                    if (!fontFamily) return;
                    const { changes } = historyStore.commitUpdate(() =>
                      setTextFontFamily(selectedElements, fontFamily),
                    );
                    commitHistoryEntry(changes, "local");
                  }}
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2 py-1 text-xs text-[var(--text-primary)]"
                >
                  <option value="">Current font</option>
                  {BOARD_PRESET_LIST.map((preset) => (
                    <option key={preset.id} value={preset.fontFamily}>{preset.name}</option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Opacity">
              <div className="flex w-32 items-center gap-2">
                <input
                  aria-label="Opacity"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={style.opacity}
                  onChange={(event) =>
                    update("opacity", Number(event.target.value))
                  }
                  className="min-w-0 flex-1 accent-[var(--accent)]"
                />
                <span className="w-9 text-right text-xs tabular-nums text-[var(--text-muted)]">
                  {style.opacity}%
                </span>
              </div>
            </Field>
          </div>
        </Section>

        {selectedCount > 0 && (
          <Section title="Arrange">
            <div
              role="group"
              aria-label="Layer order"
              className="grid grid-cols-2 gap-1.5"
            >
              {Z_ORDER_ACTIONS.map(({ action, label }) => (
                <button
                  key={action}
                  type="button"
                  aria-label={label}
                  onClick={() => {
                    const { changes: orderChanges } = historyStore.commitUpdate(
                      () => scene.reorderElements(selectedIds, action),
                    );
                    commitHistoryEntry(orderChanges, "local");
                  }}
                  className="flex h-8 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                >
                  {label}
                </button>
              ))}
            </div>
          </Section>
        )}
      </div>
    </aside>
  );
}
