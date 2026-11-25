"use client";

import { useMemo, useState } from "react";
import type { BoardPresetId, Element } from "@repo/common";
import { mermaidToCanvasElements } from "@repo/engine";

const STARTER_MERMAID = `graph TD
  Client[Web Client] --> Gateway[API Gateway]
  Gateway --> Redis[(Redis Delta CAS)]
  Redis --> Worker[Flush Worker]
  Worker --> DB[(Postgres)]`;

export interface DiagramCodePaneProps {
  open: boolean;
  presetId?: BoardPresetId;
  onClose: () => void;
  onApplyElements: (
    elements: Element[],
    mode: "insert" | "replace",
    diagramGroupId: string,
  ) => void;
}

export function DiagramCodePane({
  open,
  presetId = "clean-sketch",
  onClose,
  onApplyElements,
}: DiagramCodePaneProps) {
  const [code, setCode] = useState(STARTER_MERMAID);
  const [groupId, setGroupId] = useState<string | null>(null);

  const preview = useMemo(
    () => mermaidToCanvasElements(code, { presetId, diagramGroupId: groupId ?? "diagram-preview" }),
    [code, presetId, groupId],
  );

  if (!open) return null;

  return (
    <aside
      data-editor-chrome
      aria-label="Diagram Code Pane"
      className="animate-drawer-right fixed bottom-0 right-0 top-0 z-50 flex w-[min(22.5rem,100vw)] flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Diagram Code
          </h2>
          <p className="text-[11px] text-[var(--text-muted)]">
            Mermaid flowchart, sequence &amp; state → auto-layout
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Diagram Code Pane"
          className="rounded-lg px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-surface)]"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 flex flex-col p-3 gap-2 overflow-hidden">
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          aria-label="Mermaid diagram source"
          className="flex-1 w-full resize-none rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 font-mono text-xs leading-relaxed text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
        />

        {/* Live status & syntax error hints */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-[11px]">
          <div className="flex items-center justify-between text-[var(--text-muted)]">
            <span>
              {preview.parsed.nodes.length} nodes · {preview.parsed.edges.length} edges
            </span>
            <span className="font-mono uppercase">{preview.parsed.direction}</span>
          </div>
          {preview.parsed.errors.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-rose-400">
              {preview.parsed.errors.slice(0, 3).map((err) => (
                <li key={`${err.line}-${err.message}`}>
                  Line {err.line}: {err.message}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            disabled={preview.elements.length === 0}
            onClick={() => {
              const nextGroup = `diagram-${crypto.randomUUID().slice(0, 13)}`;
              const { elements } = mermaidToCanvasElements(code, { presetId, diagramGroupId: nextGroup });
              onApplyElements(elements, "insert", nextGroup);
              setGroupId(nextGroup);
            }}
            className="flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] py-2 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-canvas)] disabled:opacity-40"
          >
            Insert at viewport
          </button>
          <button
            type="button"
            disabled={preview.elements.length === 0 || !groupId}
            onClick={() => { if (groupId) onApplyElements(preview.elements, "replace", groupId); }}
            className="flex-1 rounded-xl bg-[var(--accent)] py-2 text-xs font-semibold text-[var(--accent-fg)] hover:bg-[var(--accent-hover)] disabled:opacity-40"
          >
            Replace linked group
          </button>
        </div>
      </div>
    </aside>
  );
}
