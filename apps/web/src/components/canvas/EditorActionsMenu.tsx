import { useEffect, useRef, useState } from "react";
import { toolManager } from "@/lib/tools/toolManager";

type EditorPanel = "search" | "library" | "layout" | "summary";

export function EditorActionsMenu({
  readOnly,
  onOpenPanel,
  onZen,
}: {
  readOnly: boolean;
  onOpenPanel: (panel: EditorPanel, trigger?: HTMLButtonElement) => void;
  onZen: () => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const toggle = () => {
      if (!open && document.activeElement instanceof HTMLElement)
        trigger.current = document.activeElement;
      setOpen((value) => !value);
    };
    const close = (event: Event) => {
      if ((event as CustomEvent).detail !== "actions") setOpen(false);
    };
    window.addEventListener("editor-actions-toggle", toggle);
    window.addEventListener("editor-panel-open", close);
    return () => {
      window.removeEventListener("editor-actions-toggle", toggle);
      window.removeEventListener("editor-panel-open", close);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open) return null;
  const button =
    "min-h-10 rounded-lg px-3 text-left text-xs font-medium leading-4 text-[var(--text-primary)] hover:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";
  const choosePanel = (panel: EditorPanel) => {
    setOpen(false);
    onOpenPanel(
      panel,
      trigger.current instanceof HTMLButtonElement
        ? trigger.current
        : undefined,
    );
  };

  return (
    <section
      aria-label="Canvas actions"
      className="editor-actions-menu fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-3 z-[70] w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/95 p-2 text-[var(--text-primary)] shadow-2xl backdrop-blur-md"
    >
      <div className="mb-1 flex items-center justify-between px-2 py-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Canvas actions
        </h2>
        <button
          type="button"
          aria-label="Close actions"
          onClick={() => {
            setOpen(false);
            trigger.current?.focus();
          }}
          className="grid h-7 w-7 place-items-center rounded-lg text-sm font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          ×
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <button className={button} onClick={() => choosePanel("search")}>
          Find text{" "}
          <span className="block text-[11px] font-normal text-[var(--text-muted)]">
            Ctrl/⌘ F
          </span>
        </button>
        <button className={button} onClick={() => choosePanel("library")}>
          Library
        </button>
        {!readOnly && (
          <button className={button} onClick={() => choosePanel("layout")}>
            Arrange
          </button>
        )}
        <button className={button} onClick={() => choosePanel("summary")}>
          Elements
        </button>
        <button
          className={button}
          onClick={() => {
            setOpen(false);
            window.dispatchEvent(new Event("editor-help-open"));
          }}
        >
          Help & shortcuts
        </button>
        {readOnly && (
          <button
            className={`${button} ${toolManager.getActiveTool() === "laser" ? "bg-[var(--accent)] text-[var(--accent-fg)]" : ""}`}
            aria-pressed={toolManager.getActiveTool() === "laser"}
            onClick={() => {
              toolManager.setActiveTool("laser");
              setOpen(false);
            }}
          >
            Laser pointer
          </button>
        )}
        <button
          className={button}
          onClick={() => {
            setOpen(false);
            onZen();
          }}
        >
          Zen mode{" "}
          <span className="block text-[11px] font-normal text-[var(--text-muted)]">
            Alt Z
          </span>
        </button>
      </div>
    </section>
  );
}
