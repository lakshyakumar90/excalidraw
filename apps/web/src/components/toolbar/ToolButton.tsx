"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { ToolType } from "@repo/engine";
import { TOOL_LABELS, TOOL_SHORTCUTS } from "@/lib/tools/toolDefinitions";
import { ToolIcon } from "./ToolIcon";

export function ToolButton({
  type,
  active,
  onClick,
}: {
  type: ToolType;
  active: boolean;
  onClick: () => void;
}) {
  const [button, setButton] = useState<HTMLButtonElement | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const label = TOOL_LABELS[type];
  const shortcut = TOOL_SHORTCUTS[type];
  const tooltip =
    type === "selection"
      ? `${label} · ${shortcut} · Alt-click cycles overlaps`
      : `${label} · ${shortcut}`;
  const rect = showTooltip && button ? button.getBoundingClientRect() : null;

  return (
    <>
      <button
        ref={setButton}
        type="button"
        onClick={onClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        aria-label={label}
        aria-keyshortcuts={shortcut}
        aria-pressed={active}
        tabIndex={active ? 0 : -1}
        className={[
          "group relative grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
          active
            ? "bg-[var(--accent)] text-[var(--accent-fg)] shadow-xs"
            : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]",
        ].join(" ")}
      >
        <ToolIcon type={type} />
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute right-1 bottom-0.5 font-mono text-[8px] font-semibold leading-none ${
            active ? "opacity-75" : "opacity-55"
          }`}
        >
          {shortcut}
        </span>
      </button>
      {rect &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            role="tooltip"
            className="pointer-events-none fixed z-[100] whitespace-nowrap rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-primary)] shadow-xl"
            style={{
              left: rect.right + 10,
              top: rect.top + rect.height / 2,
              transform: "translateY(-50%)",
            }}
          >
            {tooltip}
          </span>,
          document.body,
        )}
    </>
  );
}
