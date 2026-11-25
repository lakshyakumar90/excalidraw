"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { ToolType } from "@repo/engine";
import { toolManager } from "@/lib/tools/toolManager";
import { TOOL_TYPES } from "@/lib/tools/toolDefinitions";
import { ToolButton } from "./ToolButton";

export function Toolbar() {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const expanded = hovered || pinned;

  useEffect(() => {
    const close = (event: Event) => {
      if ((event as CustomEvent).detail !== "tools") setPinned(false);
    };
    window.addEventListener("editor-panel-open", close);
    return () => window.removeEventListener("editor-panel-open", close);
  }, []);

  const activeTool = useSyncExternalStore(
    toolManager.subscribe,
    toolManager.getActiveTool.bind(toolManager),
    () => "selection" as ToolType,
  );

  return (
    <>
      <div
        id="drawing-tools"
        data-expanded={expanded}
        role="toolbar"
        aria-label="Drawing tools"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onKeyDown={(event) => {
          if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key))
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
                    (event.key === "ArrowDown" ? 1 : -1) +
                    buttons.length) %
                  buttons.length;
          buttons.forEach((b, i) => (b.tabIndex = i === next ? 0 : -1));
          buttons[next]?.focus();
        }}
        className="fixed left-3 top-[max(3.75rem,calc(env(safe-area-inset-top)+3.25rem))] z-40 flex max-h-[calc(100dvh-8.5rem)] flex-col overflow-y-auto overflow-x-visible rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/95 p-1 shadow-2xl backdrop-blur-md transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] [scrollbar-width:none]"
      >
        {TOOL_TYPES.map((type) => {
          const isActive = activeTool === type;
          const visible = expanded || isActive;
          return (
            <div
              key={type}
              className={`transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                visible
                  ? "my-[1px] max-h-10 opacity-100 scale-100"
                  : "my-0 max-h-0 overflow-hidden opacity-0 scale-90 pointer-events-none"
              }`}
            >
              <ToolButton
                type={type}
                active={isActive}
                onClick={() => {
                  window.dispatchEvent(new Event("canvas-user-interaction"));
                  if (!expanded) {
                    setPinned(true);
                  } else {
                    toolManager.setActiveTool(type);
                    setPinned(false);
                  }
                }}
              />
            </div>
          );
        })}
        <button
          type="button"
          aria-label="Show all drawing tools"
          onClick={() => setPinned((v) => !v)}
          className={`mx-auto rounded-full bg-[var(--border-soft)] transition-all duration-300 hover:bg-[var(--text-muted)] ${
            expanded ? "my-0 h-0 w-0 opacity-0 overflow-hidden" : "my-0.5 h-1 w-4 opacity-100"
          }`}
        />
      </div>

      {activeTool === "eraser" && (
        <div className="animate-pop-up fixed left-1/2 top-14 z-50 -translate-x-1/2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/95 px-3 py-1.5 text-xs text-[var(--text-primary)] shadow-lg backdrop-blur-md">
          Hold{" "}
          <kbd className="mx-1 rounded border border-[var(--border-soft)] bg-[var(--bg-surface)] px-1.5 py-0.5 font-mono text-[11px]">
            Alt
          </kbd>{" "}
          to restore elements marked for deletion
        </div>
      )}
    </>
  );
}
