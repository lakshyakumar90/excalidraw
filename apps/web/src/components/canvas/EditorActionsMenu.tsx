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
    "min-h-11 rounded-lg px-3 text-left text-sm text-neutral-700 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600";
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
      className="editor-actions-menu fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-1/2 z-[70] w-[min(22rem,calc(100vw-1rem))] -translate-x-1/2 rounded-xl border border-neutral-200 bg-white p-2 shadow-lg"
    >
      <div className="mb-1 flex items-center justify-between px-2 py-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Canvas actions
        </h2>
        <button
          type="button"
          aria-label="Close actions"
          onClick={() => {
            setOpen(false);
            trigger.current?.focus();
          }}
          className="grid h-9 w-9 place-items-center rounded-lg text-neutral-600 hover:bg-neutral-100"
        >
          ×
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <button className={button} onClick={() => choosePanel("search")}>
          Find text{" "}
          <span className="block text-xs text-neutral-500">Ctrl/⌘ F</span>
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
            className={`${button} ${toolManager.getActiveTool() === "laser" ? "bg-neutral-900 text-white" : ""}`}
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
          Zen mode <span className="block text-xs text-neutral-500">Alt Z</span>
        </button>
      </div>
    </section>
  );
}
