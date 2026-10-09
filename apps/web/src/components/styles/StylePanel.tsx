"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Element } from "@repo/common";
import { ColorPicker } from "@/components/styles/ColorPicker";
import { toolManager } from "@/lib/tools/toolManager";
import { scene } from "@/lib/scene/scene";
import { selectionStore } from "@/lib/selection/selectionStore";
import { styleStore, type CurrentItemStyle } from "@/lib/styles/styleStore";
import { eyedropperStore } from "@/lib/styles/eyedropperStore";
import { colorHistoryStore } from "@/lib/styles/colorHistoryStore";
import { historyStore } from "@/lib/history/historyStore";
import { commitHistoryEntry } from "@/lib/sync/commits";

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
  const [isCollapsed, setIsCollapsed] = useState(true);
  useEffect(() => {
    const query = matchMedia("(max-width:1199px)");
    const update = () => setIsCollapsed(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
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
      className={`editor-style-panel fixed z-50 flex flex-col overflow-hidden border border-neutral-200 bg-white text-neutral-900 ${
        isCollapsed ? "w-auto" : "w-[min(17rem,calc(100vw-0.5rem))]"
      }`}
    >
      <header
        className={`flex items-center justify-between gap-4 px-4 ${isCollapsed ? "py-3" : "pb-4 pt-5"}`}
      >
        <div className={isCollapsed ? "flex items-center gap-3" : ""}>
          <h2 className="text-sm font-semibold tracking-[-0.02em] text-neutral-900">
            Style
          </h2>
          {!isCollapsed && (
            <p className="mt-1 text-[11px] text-neutral-500">
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
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
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
                  className="rounded-md px-2 py-1 text-xs font-medium text-neutral-600 transition hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
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
            <p className="text-[11px] font-medium text-neutral-600">Fill</p>
            <ChoiceGroup
              label="Fill style"
              value={style.fillStyle}
              onChange={(value) => update("fillStyle", value)}
              options={[
                {
                  value: "none",
                  label: "No fill",
                  mark: (
                    <span className="h-4 w-4 rounded border border-neutral-400" />
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
            <p className="pt-1 text-[11px] font-medium text-neutral-600">
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
            <p className="pt-1 text-[11px] font-medium text-neutral-600">
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
            <p className="pt-1 text-[11px] font-medium text-neutral-600">
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
            <p className="pt-1 text-[11px] font-medium text-neutral-600">
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
                  className="min-w-0 flex-1 accent-indigo-400"
                />
                <span className="w-9 text-right text-xs tabular-nums text-neutral-500">
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
              className="grid grid-cols-2 gap-2"
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
                  className="flex h-9 items-center justify-center rounded-md border border-neutral-200 bg-neutral-100 px-2 text-xs font-medium text-neutral-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
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
