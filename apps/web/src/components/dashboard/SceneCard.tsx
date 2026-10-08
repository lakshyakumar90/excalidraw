import Link from "next/link";
import { useEffect, useId, useRef } from "react";
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
  const renameButton = useRef<HTMLButtonElement>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const previousMode = useRef(action.mode);

  useEffect(() => {
    if (action.mode === "rename") {
      input.current?.focus();
      input.current?.select();
    } else if (action.mode === "delete") {
      cancelButton.current?.focus();
    } else if (previousMode.current) {
      (previousMode.current === "rename"
        ? renameButton
        : deleteButton
      ).current?.focus();
    }
    previousMode.current = action.mode;
  }, [action.mode]);

  return (
    <li
      className="min-w-0 rounded-xl border border-neutral-200 bg-white"
      onKeyDown={(event) => {
        if (event.key === "Escape" && action.mode && !action.pending) {
          event.preventDefault();
          action.cancel();
        }
      }}
    >
      <Link
        href={`/canvas/${encodeURIComponent(scene.id)}`}
        className="block rounded-t-xl p-5 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-violet-600"
      >
        <h2 className="break-words font-semibold [overflow-wrap:anywhere]">
          {scene.title}
        </h2>
        <p className="mt-2 text-xs text-neutral-500">
          Updated {new Date(scene.updatedAt).toLocaleString()}
        </p>
      </Link>
      <div className="border-t border-neutral-100 p-4">
        {!action.mode ? (
          <div className="flex flex-wrap gap-3">
            <button
              ref={renameButton}
              className={secondaryButton}
              onClick={() => action.open("rename")}
              aria-label={`Rename ${scene.title}`}
            >
              Rename
            </button>
            <button
              ref={deleteButton}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-700"
              onClick={() => action.open("delete")}
              aria-label={`Delete ${scene.title}`}
            >
              Delete
            </button>
          </div>
        ) : (
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
                  className="mb-2 block text-sm font-medium"
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
                  className="w-full min-w-0 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-200 disabled:opacity-60"
                />
              </>
            ) : (
              <>
                <p className="text-sm font-semibold break-words [overflow-wrap:anywhere]">
                  Delete “{scene.title}”?
                </p>
                <p className="mt-2 text-sm text-neutral-600">
                  This permanently deletes the saved scene from your account.
                  This cannot be undone.
                </p>
              </>
            )}
            {action.error && (
              <p
                id={`${id}-error`}
                role="alert"
                className="mt-3 text-sm text-red-700"
              >
                {action.error}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-3">
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
                    : "rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
                }
              >
                {action.pending
                  ? action.mode === "rename"
                    ? "Saving…"
                    : "Deleting…"
                  : action.mode === "rename"
                    ? "Save name"
                    : "Delete scene"}
              </button>
            </div>
          </form>
        )}
      </div>
    </li>
  );
}
