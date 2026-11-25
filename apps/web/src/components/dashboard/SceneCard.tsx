import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { SceneSummary } from "@/lib/api/scenes";
import { useSceneActions } from "@/hooks/dashboard/useSceneActions";
import { primaryButton, secondaryButton } from "./dashboardStyles";

interface SceneCardProps {
  scene: SceneSummary;
  onRenamed: (scene: SceneSummary) => void;
  onDeleted: (scene: SceneSummary) => void;
}

export function SceneCard({ scene, onRenamed, onDeleted }: SceneCardProps) {
  const action = useSceneActions(scene, onRenamed, onDeleted);
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const previousMode = useRef(action.mode);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (action.mode === "rename") {
      input.current?.focus();
      input.current?.select();
    } else if (action.mode === "delete") {
      cancelButton.current?.focus();
    } else if (previousMode.current) {
      menuTriggerRef.current?.focus();
    }
    previousMode.current = action.mode;
  }, [action.mode]);

  return (
    <li
      className="group relative min-w-0 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] transition hover:border-[var(--border-soft)]"
      onKeyDown={(event) => {
        if (event.key === "Escape" && action.mode && !action.pending) {
          event.preventDefault();
          action.cancel();
        }
      }}
    >
      <div className="flex items-start justify-between gap-2 p-4">
        <Link
          href={`/canvas/${encodeURIComponent(scene.id)}`}
          className="min-w-0 flex-1 rounded-lg focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <h2 className="break-words text-sm font-semibold text-[var(--text-primary)] transition group-hover:text-[var(--accent)] [overflow-wrap:anywhere]">
            {scene.title}
          </h2>
          <p className="mt-1.5 text-xs text-[var(--text-muted)]">
            Updated {new Date(scene.updatedAt).toLocaleString()}
          </p>
        </Link>
        <div ref={menuRef} className="relative shrink-0">
          <button
            ref={menuTriggerRef}
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`Actions for ${scene.title}`}
            onClick={() => setMenuOpen((prev) => !prev)}
            className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden="true">
              <circle cx="3" cy="8" r="1.25" />
              <circle cx="8" cy="8" r="1.25" />
              <circle cx="13" cy="8" r="1.25" />
            </svg>
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="animate-pop-up absolute right-0 top-9 z-20 w-36 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1 text-xs shadow-2xl"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  action.open("rename");
                }}
                className="flex w-full cursor-pointer items-center rounded-lg px-2.5 py-2 text-left text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)]"
              >
                Rename
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  action.open("delete");
                }}
                className="flex w-full cursor-pointer items-center rounded-lg px-2.5 py-2 text-left text-rose-400 transition hover:bg-rose-500/10"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
      {action.mode && (
        <div className="border-t border-[var(--border-subtle)] px-4 py-3">
          <form
            aria-busy={action.pending}
            onSubmit={(event) => {
              event.preventDefault();
              void action.submit();
            }}
            aria-label={
              action.mode === "rename"
                ? "Rename scene"
                : "Confirm scene deletion"
            }
          >
            {action.mode === "rename" ? (
              <>
                <label
                  htmlFor={`${id}-title`}
                  className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]"
                >
                  Scene name
                </label>
                <input
                  ref={input}
                  id={`${id}-title`}
                  value={action.title}
                  onChange={(event) => action.setTitle(event.target.value)}
                  maxLength={120}
                  disabled={action.pending}
                  aria-invalid={Boolean(action.error)}
                  aria-describedby={action.error ? `${id}-error` : undefined}
                  className="w-full min-w-0 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-soft)] focus:ring-2 focus:ring-[var(--focus-ring)] disabled:opacity-60"
                />
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-[var(--text-primary)] break-words [overflow-wrap:anywhere]">
                  Delete “{scene.title}”?
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  This permanently deletes the saved scene from your account.
                  This cannot be undone.
                </p>
              </>
            )}
            {action.error && (
              <p
                id={`${id}-error`}
                role="alert"
                className="mt-2 text-xs text-rose-400"
              >
                {action.error}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                ref={cancelButton}
                type="button"
                className={secondaryButton}
                disabled={action.pending}
                onClick={action.cancel}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  action.pending ||
                  (action.mode === "rename" && !action.title.trim())
                }
                className={
                  action.mode === "rename"
                    ? primaryButton
                    : "min-h-10 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
                }
              >
                {action.pending
                  ? action.mode === "rename"
                    ? "Saving…"
                    : "Deleting…"
                  : action.mode === "rename"
                    ? "Save"
                    : "Delete"}
              </button>
            </div>
          </form>
        </div>
      )}
    </li>
  );
}
