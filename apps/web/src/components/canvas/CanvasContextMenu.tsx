"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Point } from "@repo/common";

export type CanvasContextMenuAction =
  | "align-left"
  | "align-center"
  | "align-right"
  | "align-top"
  | "align-middle"
  | "align-bottom"
  | "distribute-horizontal"
  | "distribute-vertical"
  | "paste"
  | "select-all"
  | "cut"
  | "copy"
  | "duplicate"
  | "group"
  | "ungroup"
  | "backward"
  | "forward"
  | "back"
  | "front"
  | "delete";

export interface CanvasContextMenuState {
  x: number;
  y: number;
  scenePoint: Point;
  selectedCount: number;
  hasGroupedSelection: boolean;
}

interface MenuItem {
  action: CanvasContextMenuAction;
  label: string;
  shortcut?: string;
}

const CANVAS_ITEMS: MenuItem[] = [
  { action: "paste", label: "Paste", shortcut: "Ctrl+V" },
  { action: "select-all", label: "Select all", shortcut: "Ctrl+A" },
];

const SELECTION_ITEMS: MenuItem[] = [
  { action: "cut", label: "Cut", shortcut: "Ctrl+X" },
  { action: "copy", label: "Copy", shortcut: "Ctrl+C" },
  { action: "duplicate", label: "Duplicate", shortcut: "Ctrl+D" },
  { action: "group", label: "Group", shortcut: "Ctrl+G" },
  { action: "ungroup", label: "Ungroup", shortcut: "Ctrl+Shift+G" },
  { action: "back", label: "Send to back" },
  { action: "backward", label: "Send backward" },
  { action: "forward", label: "Bring forward" },
  { action: "front", label: "Bring to front" },
  ...(["left", "center", "right", "top", "middle", "bottom"] as const).map(
    (a) => ({
      action: `align-${a}` as CanvasContextMenuAction,
      label: `Align ${a}`,
    }),
  ),
  { action: "distribute-horizontal", label: "Distribute horizontally" },
  { action: "distribute-vertical", label: "Distribute vertically" },
  { action: "delete", label: "Delete", shortcut: "Del" },
];

export function CanvasContextMenu({
  state,
  onAction,
  onClose,
}: {
  state: CanvasContextMenuState;
  onAction: (action: CanvasContextMenuAction, scenePoint: Point) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const firstItemRef = useRef<HTMLButtonElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({
    left: state.x,
    top: state.y,
  });

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 12;
    const left = Math.max(pad, Math.min(state.x, window.innerWidth - rect.width - pad));
    const top = Math.max(pad, Math.min(state.y, window.innerHeight - rect.height - pad));
    setPos({ left, top });
  }, [state.x, state.y]);
  const selectionItems = SELECTION_ITEMS.filter(({ action }) => {
    if (action.startsWith("align-")) return state.selectedCount >= 2;
    if (action.startsWith("distribute-")) return state.selectedCount >= 3;
    if (action === "group") return state.selectedCount > 1;
    if (action === "ungroup") return state.hasGroupedSelection;
    return true;
  });
  const basicSelectionItems = selectionItems.filter(({ action }) =>
    ["cut", "copy", "duplicate", "group", "ungroup"].includes(action),
  );
  const arrangeItems = selectionItems.filter(
    ({ action }) =>
      ["back", "backward", "forward", "front"].includes(action) ||
      action.startsWith("align-") ||
      action.startsWith("distribute-"),
  );
  const deleteItem = selectionItems.find(({ action }) => action === "delete");

  useEffect(() => {
    firstItemRef.current?.focus();

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const handleScroll = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const handleWheel = (event: WheelEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("wheel", handleWheel, true);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("wheel", handleWheel, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onClose]);

  const renderItem = (item: MenuItem, isFirst = false) => (
    <button
      key={item.action}
      ref={isFirst ? firstItemRef : undefined}
      type="button"
      role="menuitem"
      onClick={() => onAction(item.action, state.scenePoint)}
      className={`flex h-7.5 w-full cursor-pointer items-center justify-between gap-4 rounded-lg px-2.5 text-left text-xs outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] ${
        item.action === "delete"
          ? "text-rose-400 hover:bg-rose-500/10 focus-visible:bg-rose-500/10"
          : "text-[var(--text-primary)] hover:bg-[var(--bg-hover)] focus-visible:bg-[var(--bg-hover)]"
      }`}
    >
      <span>{item.label}</span>
      {item.shortcut && (
        <span className="shrink-0 font-mono text-[10px] text-[var(--text-muted)]">
          {item.shortcut}
        </span>
      )}
    </button>
  );

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Canvas actions"
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onWheel={(event) => event.stopPropagation()}
      style={{ left: pos.left, top: pos.top }}
      className="animate-pop-up fixed z-[90] max-h-[min(24rem,calc(100vh-1.5rem))] w-56 overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/95 p-1.5 shadow-2xl backdrop-blur-md [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--border-soft)]"
    >
      {CANVAS_ITEMS.map((item, index) => (
        <span key={item.action}>
          {index > 0 && <span className="my-1 block h-px bg-[var(--border-subtle)]" />}
          {renderItem(item, index === 0)}
        </span>
      ))}

      {selectionItems.length > 0 && (
        <>
          <span className="my-1 block h-px bg-[var(--border-soft)]" />
          {basicSelectionItems.map((item) => renderItem(item))}
          {arrangeItems.length > 0 && (
            <>
              <span className="my-1 block h-px bg-[var(--border-subtle)]" />
              {arrangeItems.map((item) => renderItem(item))}
            </>
          )}
          {deleteItem && (
            <>
              <span className="my-1 block h-px bg-[var(--border-subtle)]" />
              {renderItem(deleteItem)}
            </>
          )}
        </>
      )}
    </div>
  );
}
