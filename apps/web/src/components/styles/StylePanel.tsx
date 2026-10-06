"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Element } from "@repo/common";
import { ColorPicker } from "@/components/styles/ColorPicker";
import { toolManager } from "@/lib/tools/toolManager";
import { scene } from "@/lib/scene/scene";
import { selectionStore } from "@/lib/selection/selectionStore";
import { styleStore, type CurrentItemStyle } from "@/lib/styles/styleStore";
import { eyedropperStore } from "@/lib/styles/eyedropperStore";
import { colorHistoryStore } from "@/lib/styles/colorHistoryStore";

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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-neutral-200 pt-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-h-9 items-center justify-between gap-3 text-sm text-neutral-700">
      <span>{label}</span>
      {children}
    </label>
  );
}

function selectClassName() {
  return "h-8 min-w-28 rounded-md border border-neutral-200 bg-white px-2 text-sm text-neutral-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
}

const Z_ORDER_ACTIONS = [
  { action: "back" as const, label: "Send to back" },
  { action: "backward" as const, label: "Send backward" },
  { action: "forward" as const, label: "Bring forward" },
  { action: "front" as const, label: "Bring to front" },
];

export function StylePanel() {
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

    styleStore.update(changes);
    for (const element of selectedElements) {
      scene.mutateElement(element.id, changes);
    }
  };

  return (
    <aside
      aria-label="Style properties"
      className="fixed bottom-4 right-4 top-32 z-50 flex w-[min(18rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.12)]"
    >
      <header className="flex items-start justify-between px-4 pb-4 pt-5">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.02em] text-neutral-900">
            Style
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            {selectedCount > 0
              ? `${selectedCount} element${selectedCount === 1 ? "" : "s"} selected`
              : `Defaults for ${TOOL_NAMES[activeTool]}`}
          </p>
        </div>
        <span
          aria-hidden="true"
          className="mt-1 h-2 w-2 rounded-full bg-blue-500"
        />
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-5 [scrollbar-color:#d4d4d8_transparent] [scrollbar-width:thin]">
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
            <Field label="Width">
              <select
                aria-label="Stroke width"
                className={selectClassName()}
                value={style.strokeWidth}
                onChange={(event) =>
                  update("strokeWidth", Number(event.target.value))
                }
              >
                <option value={1}>Thin</option>
                <option value={2}>Medium</option>
                <option value={4}>Bold</option>
              </select>
            </Field>
            <Field label="Style">
              <select
                aria-label="Stroke style"
                className={selectClassName()}
                value={style.strokeStyle}
                onChange={(event) =>
                  update(
                    "strokeStyle",
                    event.target.value as CurrentItemStyle["strokeStyle"],
                  )
                }
              >
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
            </Field>
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
                  className="rounded-md px-2 py-1 text-xs font-medium text-neutral-600 transition hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  {style.backgroundColor === "transparent"
                    ? "Transparent"
                    : "Clear"}
                </button>
              </div>
            </div>
            <Field label="Fill style">
              <select
                aria-label="Fill style"
                className={selectClassName()}
                value={style.fillStyle}
                onChange={(event) =>
                  update(
                    "fillStyle",
                    event.target.value as CurrentItemStyle["fillStyle"],
                  )
                }
              >
                <option value="none">None</option>
                <option value="solid">Solid</option>
                <option value="hachure">Hachure</option>
                <option value="cross-hatch">Cross-hatch</option>
              </select>
            </Field>
          </div>
        </Section>

        <Section title="Shape">
          <div className="space-y-2">
            <Field label="Sloppiness">
              <select
                aria-label="Sloppiness"
                className={selectClassName()}
                value={style.roughness}
                onChange={(event) =>
                  update("roughness", Number(event.target.value))
                }
              >
                <option value={0}>Architect</option>
                <option value={1}>Artist</option>
                <option value={2}>Cartoonist</option>
              </select>
            </Field>
            <Field label="Edges">
              <select
                aria-label="Edges"
                className={selectClassName()}
                value={style.edgeStyle}
                onChange={(event) =>
                  update(
                    "edgeStyle",
                    event.target.value as CurrentItemStyle["edgeStyle"],
                  )
                }
              >
                <option value="sharp">Sharp</option>
                <option value="rounded">Rounded</option>
              </select>
            </Field>
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
                  className="min-w-0 flex-1 accent-blue-600"
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
                  onClick={() => scene.reorderElements(selectedIds, action)}
                  className="flex h-9 items-center justify-center rounded-md border border-neutral-200 bg-white px-2 text-xs font-medium text-neutral-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
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
