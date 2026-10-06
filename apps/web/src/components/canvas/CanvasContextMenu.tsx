"use client";

import { useEffect, useRef } from "react";
import type { Point } from "@repo/common";

export type CanvasContextMenuAction =
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
  const selectionItems = SELECTION_ITEMS.filter(({ action }) => {
    if (action === "group") return state.selectedCount > 1;
    if (action === "ungroup") return state.hasGroupedSelection;
    return true;
  });
  const basicSelectionItems = selectionItems.filter(({ action }) =>
    ["cut", "copy", "duplicate", "group", "ungroup"].includes(action),
  );
  const arrangeItems = selectionItems.filter(({ action }) =>
    ["back", "backward", "forward", "front"].includes(action),
  );
  const deleteItem = selectionItems.find(({ action }) => action === "delete");

  useEffect(() => {
    firstItemRef.current?.focus();

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const handleScroll = () => onClose();
    const handleWheel = () => onClose();
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
      className="flex h-8 w-full items-center justify-between gap-5 rounded-md px-2.5 text-left text-sm text-neutral-800 outline-none transition hover:bg-blue-50 hover:text-blue-800 focus-visible:bg-blue-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
    >
      <span>{item.label}</span>
      {item.shortcut && (
        <span className="shrink-0 text-xs text-neutral-500">
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
      style={{ left: state.x, top: state.y }}
      className="fixed z-[90] max-h-[calc(100vh-1rem)] w-56 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-1.5 shadow-[0_12px_32px_rgba(15,23,42,0.18)] [scrollbar-color:#d4d4d8_transparent] [scrollbar-width:thin]"
    >
      {CANVAS_ITEMS.map((item, index) => (
        <span key={item.action}>
          {index > 0 && <span className="my-1 block h-px bg-neutral-100" />}
          {renderItem(item, index === 0)}
        </span>
      ))}

      {selectionItems.length > 0 && (
        <>
          <span className="my-1 block h-px bg-neutral-200" />
          {basicSelectionItems.map((item) => renderItem(item))}
          {arrangeItems.length > 0 && (
            <>
              <span className="my-1 block h-px bg-neutral-100" />
              {arrangeItems.map((item) => renderItem(item))}
            </>
          )}
          {deleteItem && (
            <>
              <span className="my-1 block h-px bg-neutral-100" />
              {renderItem(deleteItem)}
            </>
          )}
        </>
      )}
    </div>
  );
}
