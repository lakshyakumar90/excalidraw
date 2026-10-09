"use client";

import { useState, useSyncExternalStore } from "react";
import type { ToolType } from "@repo/engine";
import { toolManager } from "@/lib/tools/toolManager";
import {
  TOOL_LABELS,
  TOOL_SHORTCUTS,
  TOOL_TYPES,
} from "@/lib/tools/toolDefinitions";
import { ToolIcon } from "./ToolIcon";
import { FileMenu } from "./FileMenu";

function ToolButton({
  type,
  active,
  onClick,
}: {
  type: ToolType;
  active: boolean;
  onClick: () => void;
}) {
  const label = TOOL_LABELS[type];
  const tooltip =
    type === "selection"
      ? `${label} · ${TOOL_SHORTCUTS[type]} · Alt-click cycles overlaps`
      : `${label} · ${TOOL_SHORTCUTS[type]}`;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-keyshortcuts={TOOL_SHORTCUTS[type]}
      aria-pressed={active}
      tabIndex={active ? 0 : -1}
      className={[
        "group relative grid h-11 w-11 shrink-0 place-items-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1",
        active
          ? "bg-neutral-900 text-white"
          : "text-neutral-700 hover:bg-neutral-100",
      ].join(" ")}
    >
      <ToolIcon type={type} />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-[calc(100%+8px)] z-[60] hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg group-hover:block group-focus-visible:block"
      >
        {tooltip}
      </span>
    </button>
  );
}

export function Toolbar() {
  const [expanded, setExpanded] = useState(false);
  const activeTool = useSyncExternalStore(
    toolManager.subscribe,
    toolManager.getActiveTool.bind(toolManager),
    () => "selection" as ToolType,
  );

  return (
    <>
      <button
        className="mobile-tools-toggle fixed left-1/2 top-2 z-[60] min-h-11 -translate-x-1/2 rounded-lg border bg-white px-4 text-sm shadow-sm"
        aria-expanded={expanded}
        aria-controls="drawing-tools"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? "Close tools" : `Tools · ${TOOL_LABELS[activeTool]}`}
      </button>
      <div
        id="drawing-tools"
        data-expanded={expanded}
        role="toolbar"
        aria-label="Drawing tools"
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
            return;
          event.preventDefault();
          const buttons = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>(
              "button[aria-pressed]",
            ),
          );
          const index = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? buttons.length - 1
                : (index +
                    (event.key === "ArrowRight" ? 1 : -1) +
                    buttons.length) %
                  buttons.length;
          buttons.forEach((b, i) => (b.tabIndex = i === next ? 0 : -1));
          buttons[next]?.focus();
        }}
        className="editor-tool-strip fixed left-1/2 top-4 z-50 flex w-max max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-wrap justify-center gap-1 rounded-lg border border-black/10 bg-white/95 p-1 shadow-sm backdrop-blur"
      >
        {TOOL_TYPES.map((type) => (
          <ToolButton
            key={type}
            type={type}
            active={activeTool === type}
            onClick={() => {
              window.dispatchEvent(new Event("canvas-user-interaction"));
              toolManager.setActiveTool(type);
              setExpanded(false);
            }}
          />
        ))}
        <span
          aria-hidden="true"
          className="my-1 w-px shrink-0 bg-neutral-200"
        />
        <FileMenu />
      </div>
      {activeTool === "eraser" && (
        <div className="fixed left-1/2 top-[4.5rem] z-50 -translate-x-1/2 rounded-md bg-neutral-900/75 px-3 py-1.5 text-xs text-white shadow-sm">
          Hold{" "}
          <kbd className="mx-1 rounded border border-white/30 px-1.5 py-0.5 font-mono">
            Alt
          </kbd>{" "}
          to restore elements marked for deletion
        </div>
      )}
    </>
  );
}
