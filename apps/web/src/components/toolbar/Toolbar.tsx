"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { ToolType } from "@repo/engine";
import { toolManager } from "@/lib/tools/toolManager";
import { TOOL_LABELS, TOOL_TYPES } from "@/lib/tools/toolDefinitions";
import { FileMenu } from "./FileMenu";
import { ToolButton } from "./ToolButton";

export function Toolbar() {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const close = (event: Event) => {
      if ((event as CustomEvent).detail !== "tools") setExpanded(false);
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
      <button
        className="mobile-tools-toggle min-h-11 rounded-lg border border-neutral-200 bg-white px-4 text-sm shadow-sm"
        aria-expanded={expanded}
        aria-controls="drawing-tools"
        onClick={() => {
          setExpanded((v) => !v);
          window.dispatchEvent(
            new CustomEvent("editor-panel-open", { detail: "tools" }),
          );
        }}
      >
        {expanded ? (
          "Close tools"
        ) : (
          <>
            <span className="tools-toggle-prefix">Tools · </span>
            {TOOL_LABELS[activeTool]}
          </>
        )}
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
        className="editor-tool-strip flex w-max max-w-[calc(100vw-20rem)] flex-wrap justify-center gap-1 rounded-xl border border-neutral-200 bg-white/95 p-1 shadow-sm backdrop-blur"
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
