"use client";

import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { ToolType } from "@repo/engine";
import { toolManager } from "@/lib/tools/toolManager";
import { FileMenu } from "./FileMenu";

const TOOL_LABELS: Record<ToolType, string> = {
  selection: "Select",
  text: "Text",
  hand: "Hand",
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  diamond: "Diamond",
  line: "Line",
  multiPointLine: "Multi-point line",
  arrow: "Arrow",
  "curved-line": "Curve",
  freedraw: "Pencil",
  eraser: "Eraser",
};

const TOOL_SHORTCUTS: Record<ToolType, string> = {
  selection: "V",
  text: "T",
  hand: "H",
  rectangle: "R",
  ellipse: "O",
  diamond: "D",
  line: "L",
  multiPointLine: "P",
  arrow: "A",
  "curved-line": "C",
  freedraw: "F",
  eraser: "E",
};

function ToolIcon({ type }: { type: ToolType }) {
  let shape: ReactNode;

  switch (type) {
    case "selection":
      shape = (
        <path
          d="M5 3v17l4.5-4.5 3 6 2.5-1.2-3-6H19L5 3Z"
          fill="currentColor"
          stroke="none"
        />
      );
      break;
    case "text":
      shape = (
        <>
          <path d="M4 6V4h16v2M12 4v16m-4 0h8" />
        </>
      );
      break;
    case "hand":
      shape = (
        <path d="M8 11V5.5a1.5 1.5 0 0 1 3 0V10 4.5a1.5 1.5 0 0 1 3 0V10 5.5a1.5 1.5 0 0 1 3 0V12l.7-1.1a1.6 1.6 0 0 1 2.8 1.4l-2 5A4 4 0 0 1 14.8 20h-2.1a4 4 0 0 1-3.1-1.5L6.2 14a1.7 1.7 0 0 1 2.5-2.2L10 13" />
      );
      break;
    case "eraser":
      shape = (
        <path d="m7.2 20-4.3-4.3a2 2 0 0 1 0-2.8l9.9-9.9a2 2 0 0 1 2.8 0l5.5 5.5a2 2 0 0 1 0 2.8L12 20H7.2Zm4.8 0 4-4" />
      );
      break;
    case "rectangle":
      shape = <rect x="4" y="5" width="16" height="14" rx="1" />;
      break;
    case "ellipse":
      shape = <ellipse cx="12" cy="12" rx="8" ry="6.5" />;
      break;
    case "diamond":
      shape = <path d="m12 3 9 9-9 9-9-9 9-9Z" />;
      break;
    case "line":
      shape = <path d="m5 19 14-14" />;
      break;
    case "multiPointLine":
      shape = (
        <>
          <path d="m4 18 6-11 4 8 6-9" />
          <circle cx="4" cy="18" r="1.2" fill="currentColor" />
          <circle cx="10" cy="7" r="1.2" fill="currentColor" />
          <circle cx="14" cy="15" r="1.2" fill="currentColor" />
          <circle cx="20" cy="6" r="1.2" fill="currentColor" />
        </>
      );
      break;
    case "arrow":
      shape = <path d="M4 12h15m-6-6 6 6-6 6" />;
      break;
    case "curved-line":
      shape = <path d="M4 17c4-12 12-12 16-2" />;
      break;
    case "freedraw":
      shape = <path d="M4 17c2-8 4 5 7-2s4-8 5-3 3 5 4-3" />;
      break;
  }

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {shape}
    </svg>
  );
}

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
      {(Object.keys(TOOL_LABELS) as ToolType[]).map((type) => (
        <ToolButton
          key={type}
          type={type}
          active={activeTool === type}
          onClick={() => toolManager.setActiveTool(type)}
        />
      ))}
      <span aria-hidden="true" className="my-1 w-px shrink-0 bg-neutral-200" />
      <FileMenu />
    </div>
    {activeTool === "eraser" && (
      <div className="fixed left-1/2 top-[4.5rem] z-50 -translate-x-1/2 rounded-md bg-neutral-900/75 px-3 py-1.5 text-xs text-white shadow-sm">
        Hold <kbd className="mx-1 rounded border border-white/30 px-1.5 py-0.5 font-mono">Alt</kbd> to restore elements marked for deletion
      </div>
    )}
    </>
  );
}
