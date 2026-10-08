"use client";

import { useSyncExternalStore } from "react";
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
      className={[
        "group relative grid h-10 w-10 shrink-0 place-items-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1",
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
  const activeTool = useSyncExternalStore(
    toolManager.subscribe,
    toolManager.getActiveTool.bind(toolManager),
    () => "selection" as ToolType,
  );

  return (
    <>
      <div
        role="toolbar"
        aria-label="Drawing tools"
        className="fixed left-1/2 top-4 z-50 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-wrap justify-center gap-1 rounded-lg border border-black/10 bg-white/95 p-1 shadow-sm backdrop-blur"
      >
        {TOOL_TYPES.map((type) => (
          <ToolButton
            key={type}
            type={type}
            active={activeTool === type}
            onClick={() => toolManager.setActiveTool(type)}
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
