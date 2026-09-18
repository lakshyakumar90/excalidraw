"use client";

import { useSyncExternalStore } from "react";
import type { ToolType } from "@repo/engine";
import { toolManager } from "@/lib/tools/toolManager";

const TOOL_LABELS: Record<ToolType, string> = {
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  diamond: "Diamond",
};

const TOOL_SHORTCUTS: Record<ToolType, string> = {
  rectangle: "R",
  ellipse: "E",
  diamond: "D",
};

function ToolButton({
  type,
  label,
  active,
  onClick,
}: {
  type: ToolType;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}

      className={[
        "rounded-md px-3 py-2 text-sm transition",
        active
          ? "bg-neutral-900 text-white"
          : "text-neutral-700 hover:bg-neutral-100",
      ].join(" ")}
    >
      <span>{label}</span>
      <span className="ml-2 text-[10px] opacity-50">
        {TOOL_SHORTCUTS[type]}
      </span>
    </button>
  );
}

export function Toolbar() {
  const activeTool = useSyncExternalStore(
    toolManager.subscribe,
    toolManager.getActiveTool.bind(toolManager),
    () => "rectangle" as ToolType,
  );

  const selectTool = (type: ToolType) => {
    toolManager.setActiveTool(type);
  };

  return (
    <div className="fixed left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-black/10 bg-white/95 p-1 shadow-sm backdrop-blur">
      {(Object.keys(TOOL_LABELS) as ToolType[]).map((type) => (
        <ToolButton
          key={type}
          type={type}
          label={TOOL_LABELS[type]}
          active={activeTool === type}
          onClick={() => selectTool(type)}
        />
      ))}
    </div>
  );
}
