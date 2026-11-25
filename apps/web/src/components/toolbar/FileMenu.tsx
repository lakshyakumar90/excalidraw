"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { authClient } from "@repo/auth/client";
import {
  applyImportedDocument,
  publishImportStatus,
  readExcalidrawFile,
} from "@/lib/persistence/importDocument";

export function FileMenu() {
  const [open, setOpen] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { data: session } = authClient.useSession();

  useEffect(() => {
    const onStatus = (event: Event) => {
      const statusEvent = event as CustomEvent<string | null>;
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
      setImportStatus(statusEvent.detail);
      if (statusEvent.detail) {
        statusTimerRef.current = setTimeout(() => setImportStatus(null), 3000);
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("excalidraw-import-status", onStatus);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("excalidraw-import-status", onStatus);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    };
  }, []);

  const importFile = async (file: File) => {
    try {
      const document = await readExcalidrawFile(file);
      await applyImportedDocument(document);
      publishImportStatus(`Imported ${file.name}`);
      setOpen(false);
    } catch (error) {
      publishImportStatus(
        error instanceof Error ? error.message : "Could not import this drawing",
      );
    }
  };

  const itemClass =
    "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)]";

  return (
    <div ref={wrapperRef} className="relative shrink-0">
      <input
        ref={fileInputRef}
        type="file"
        accept=".excalidraw,.json,application/json"
        className="hidden"
        aria-label="Import Excalidraw file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void importFile(file);
          event.currentTarget.value = "";
        }}
      />
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        aria-label="Menu"
        title="Menu"
        className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/95 text-[var(--text-primary)] shadow-xl backdrop-blur-md transition hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Chitran menu"
          className="animate-pop-up absolute left-0 top-[calc(100%+8px)] z-[60] w-60 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-1.5 text-xs text-[var(--text-primary)] shadow-2xl"
        >
          <Link href="/boards" onClick={() => setOpen(false)} className={itemClass}>
            <span>My boards</span>
          </Link>
          <Link href="/dashboard" onClick={() => setOpen(false)} className={itemClass}>
            <span>Dashboard &amp; Rooms</span>
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              window.dispatchEvent(new CustomEvent("open-ai-palette"));
            }}
            className={itemClass}
          >
            <span>Connect AI</span>
          </button>

          <div className="my-1 border-t border-[var(--border-subtle)]" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              window.dispatchEvent(new CustomEvent("open-export-modal"));
            }}
            className={itemClass}
          >
            <span>Export…</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => fileInputRef.current?.click()}
            className={itemClass}
          >
            <span>Import .excalidraw</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              window.dispatchEvent(new Event("editor-help-open"));
            }}
            className={itemClass}
          >
            <span>Keyboard shortcuts</span>
            <kbd className="rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
              ?
            </kbd>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              window.dispatchEvent(new CustomEvent("open-mcp-modal"));
            }}
            className={itemClass}
          >
            <span>Connect MCP agent</span>
          </button>

          <div className="my-1 border-t border-[var(--border-subtle)]" />

          <Link
            href={session ? "/dashboard" : "/login"}
            onClick={() => setOpen(false)}
            className={itemClass}
          >
            <span className="flex items-center gap-2">
              {!session && (
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5">
                  <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.5 3.8-5.4 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.5 12 2.5 6.8 2.5 2.5 6.8 2.5 12S6.8 21.5 12 21.5c6.9 0 9.1-4.8 9.1-7.3 0-.5-.1-.9-.1-1.3H12Z" />
                </svg>
              )}
              <span>{session ? "My account" : "Sign in"}</span>
            </span>
          </Link>
        </div>
      )}

      {importStatus &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="status"
            className="animate-pop-up fixed bottom-4 left-1/2 z-[100] -translate-x-1/2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] shadow-2xl"
          >
            {importStatus}
          </div>,
          document.body,
        )}
    </div>
  );
}
