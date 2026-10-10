"use client";

import { useEffect, useRef, useState } from "react";
import { authClient } from "@repo/auth/client";
import {
  listLibrary,
  getLibraryItem,
  saveLibraryItem,
  changeLibraryItem,
  insertStamp,
} from "@/lib/persistence/library";

export function PersonalLibraryPanel({
  readOnly,
  roomId,
  selectionCount,
}: {
  readOnly: boolean;
  roomId?: string;
  selectionCount: number;
}) {
  const { data: session } = authClient.useSession();
  const signedIn = Boolean(session?.user);
  const permission = useRef(readOnly);
  const [name, setName] = useState("");
  const [items, setItems] = useState<
    Awaited<ReturnType<typeof listLibrary>>["items"]
  >([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const button =
    "min-h-11 inline-flex items-center justify-center rounded-lg px-3 text-sm text-neutral-700 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:opacity-40";

  useEffect(() => {
    permission.current = readOnly;
  }, [readOnly]);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(async () => {
      setBusy(true);
      setError("");
      try {
        const response = await listLibrary(signedIn, 0);
        if (!cancelled) {
          setItems(response.items);
          setNextOffset(response.nextOffset);
        }
      } catch (reason) {
        if (!cancelled)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load your library. Try again.",
          );
      } finally {
        if (!cancelled) setBusy(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  async function refresh(append = false) {
    const response = await listLibrary(
      signedIn,
      append ? (nextOffset ?? 0) : 0,
    );
    setItems((previous) =>
      append ? [...previous, ...response.items] : response.items,
    );
    setNextOffset(response.nextOffset);
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The action failed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="mb-3 text-sm text-neutral-600">
        {signedIn
          ? "Private stamps saved to your account."
          : "Stamps saved on this device. Sign in for an account library."}
      </p>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            await saveLibraryItem(signedIn, name.trim());
            setName("");
            await refresh();
          });
        }}
      >
        <input
          aria-label="Stamp name"
          placeholder="Stamp name"
          maxLength={100}
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 text-sm focus:outline-2 focus:outline-violet-600"
        />
        <button
          className={button}
          disabled={busy || !selectionCount || !name.trim()}
        >
          Save
        </button>
      </form>
      <p className="mt-2 text-xs text-neutral-600">
        Select a group on the canvas before saving.
      </p>
      {!items.length && !busy && (
        <p className="my-4 text-sm">Your library is empty.</p>
      )}
      <ul className="mt-3 divide-y divide-neutral-100">
        {items.map((item) => (
          <li key={item.id} className="py-2">
            <button
              className={`${button} w-full truncate text-left font-medium`}
              disabled={busy || readOnly}
              onClick={() =>
                void run(async () =>
                  insertStamp(
                    await getLibraryItem(signedIn, item.id),
                    roomId,
                    () => !permission.current,
                  ),
                )
              }
            >
              {item.name}
              {readOnly ? " (read only)" : " · Insert"}
            </button>
            {renaming === item.id && (
              <form
                className="flex"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(async () => {
                    await changeLibraryItem(
                      signedIn,
                      item.id,
                      renameName.trim(),
                    );
                    setRenaming(null);
                    await refresh();
                  });
                }}
              >
                <input
                  autoFocus
                  aria-label="New stamp name"
                  maxLength={100}
                  required
                  value={renameName}
                  onChange={(event) => setRenameName(event.target.value)}
                  className="min-h-11 min-w-0 rounded-lg border px-2"
                />
                <button
                  className={button}
                  disabled={busy || !renameName.trim()}
                >
                  Rename
                </button>
              </form>
            )}
            <div className="flex">
              <button
                className={button}
                disabled={busy}
                onClick={() => {
                  setRenaming(item.id);
                  setRenameName(item.name);
                }}
              >
                Rename
              </button>
              <button
                className={button}
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await changeLibraryItem(signedIn, item.id);
                    await refresh();
                  })
                }
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
      {nextOffset !== null && (
        <button
          className={button}
          disabled={busy}
          onClick={() => void run(() => refresh(true))}
        >
          Load more
        </button>
      )}
      {busy && (
        <p role="status" className="mt-3 text-sm">
          Working…
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </>
  );
}
