"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { authClient } from "@repo/auth/client";
import type { LibrarySummary } from "@repo/common";
import { visibleBounds, type LayoutAction } from "@repo/engine";
import { scene } from "@/lib/scene/scene";
import { useScene } from "@/lib/scene/useScene";
import { selectionStore } from "@/lib/selection/selectionStore";
import { snappingPreference } from "@/lib/selection/selectionController";
import { applyLayout } from "@/lib/canvas/layoutActions";
import {
  setCurrentViewport,
  getCurrentViewport,
} from "@/lib/persistence/viewportStore";
import {
  listLibrary,
  getLibraryItem,
  saveLibraryItem,
  changeLibraryItem,
  insertStamp,
} from "@/lib/persistence/library";
import {
  subscribeSnapPreference,
  readSnapPreference,
  writeSnapPreference,
} from "@/lib/styles/snappingPreference";
import { toolManager } from "@/lib/tools/toolManager";

const actions: LayoutAction[] = [
  "left",
  "center",
  "right",
  "top",
  "middle",
  "bottom",
  "horizontal",
  "vertical",
];
export function EditorExtras({
  readOnly,
  roomId,
}: {
  readOnly: boolean;
  roomId?: string;
}) {
  useScene(scene);
  const selection = useSyncExternalStore(
    selectionStore.subscribe,
    selectionStore.getSnapshot,
    selectionStore.getSnapshot,
  );
  const { data: session } = authClient.useSession();
  const signedIn = Boolean(session?.user);
  const [panel, setPanel] = useState<
    "search" | "library" | "layout" | "summary" | null
  >(null);
  const [zen, setZen] = useState(false),
    [query, setQuery] = useState(""),
    [name, setName] = useState(""),
    [items, setItems] = useState<LibrarySummary[]>([]),
    [nextOffset, setNextOffset] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const snap = useSyncExternalStore(
    subscribeSnapPreference,
    readSnapPreference,
    () => true,
  );
  const [renaming, setRenaming] = useState<string | null>(null),
    [renameName, setRenameName] = useState("");
  useEffect(() => {
    snappingPreference.enabled = snap;
  }, [snap]);
  const permission = useRef(readOnly);
  useEffect(() => {
    permission.current = readOnly;
  }, [readOnly]);
  const trigger = useRef<HTMLButtonElement | null>(null),
    input = useRef<HTMLInputElement | null>(null);
  const elements = scene.getElements().filter((e) => !e.isDeleted);
  const results = query.trim()
    ? elements.filter(
        (e) =>
          e.type === "text" &&
          e.text
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase()) &&
          visibleBounds(e, elements),
      )
    : [];
  const close = useCallback(() => {
    setPanel(null);
    setBusy(false);
    trigger.current?.focus();
  }, []);
  const open = useCallback(
    (value: typeof panel, button?: HTMLButtonElement) => {
      if (button) trigger.current = button;
      setError("");
      setPanel(value);
      setBusy(false);
      if (value)
        window.dispatchEvent(
          new CustomEvent("editor-panel-open", { detail: "extras" }),
        );
    },
    [],
  );
  useEffect(() => {
    const closePanel = (event: Event) => {
      if (
        matchMedia("(max-width:1199px)").matches &&
        (event as CustomEvent).detail !== "extras"
      )
        setPanel(null);
    };
    window.addEventListener("editor-panel-open", closePanel);
    return () => window.removeEventListener("editor-panel-open", closePanel);
  }, []);
  useEffect(() => {
    if (panel === "search") input.current?.focus();
  }, [panel]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input,textarea,[contenteditable=true]")) {
        if (e.key === "Escape") close();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        open("search");
      }
      if (e.key === "Escape") {
        setZen(false);
        close();
      }
      if (e.altKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        setZen((v) => !v);
        setPanel(null);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, close]);
  useEffect(() => {
    document.documentElement.classList.toggle("editor-zen", zen);

    return () => document.documentElement.classList.remove("editor-zen");
  }, [zen]);
  useEffect(
    () =>
      scene.onCommit((commit) =>
        setNotice(
          `${commit.elements.length} element${commit.elements.length === 1 ? "" : "s"} updated. ${scene.getElements().filter((e) => !e.isDeleted).length} elements in the drawing.`,
        ),
      ),
    [],
  );
  async function refresh(append = false) {
    const response = await listLibrary(
      signedIn,
      append ? (nextOffset ?? 0) : 0,
    );
    setItems((old) => (append ? [...old, ...response.items] : response.items));
    setNextOffset(response.nextOffset);
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The action failed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (panel !== "library") return;
    let cancelled = false;
    queueMicrotask(async () => {
      if (cancelled) return;
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
  }, [panel, signedIn]);

  const jump = (id: string) => {
    const e = scene.getElement(id);
    if (!e) return;
    const b = visibleBounds(e, elements);
    if (!b) return;
    const v = getCurrentViewport();
    window.dispatchEvent(new Event("canvas-user-interaction"));
    setCurrentViewport({
      ...v,
      scrollX: window.innerWidth / 2 - ((b.minX + b.maxX) / 2) * v.zoom,
      scrollY: window.innerHeight / 2 - ((b.minY + b.maxY) / 2) * v.zoom,
    });
    selectionStore.set([id]);
  };
  const button =
    "min-h-11 rounded-md px-3 text-sm text-neutral-700 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:opacity-40";
  return (
    <>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {notice}
      </div>
      <div
        data-editor-chrome
        className="editor-extra-actions fixed bottom-20 right-4 z-50 flex gap-1 rounded-lg border border-neutral-200 bg-white p-1 shadow-sm"
      >
        <button
          className={button}
          onClick={(e) =>
            open(panel === "search" ? null : "search", e.currentTarget)
          }
        >
          Find
        </button>
        <button
          className={button}
          onClick={(e) =>
            open(panel === "library" ? null : "library", e.currentTarget)
          }
        >
          Library
        </button>
        {!readOnly && (
          <button
            className={button}
            onClick={(e) =>
              open(panel === "layout" ? null : "layout", e.currentTarget)
            }
          >
            Arrange
          </button>
        )}
        <button
          className={button}
          onClick={(e) =>
            open(panel === "summary" ? null : "summary", e.currentTarget)
          }
        >
          Elements
        </button>
        <button
          className={button}
          onClick={() => {
            setPanel(null);
            setZen(true);
          }}
        >
          Zen
        </button>
        {readOnly && (
          <button
            className={button}
            aria-pressed={toolManager.getActiveTool() === "laser"}
            onClick={() => toolManager.setActiveTool("laser")}
          >
            Laser
          </button>
        )}
      </div>
      {zen && (
        <button
          aria-label="Exit zen mode"
          className="fixed right-4 top-4 z-[90] min-h-11 rounded-lg bg-white px-4 text-sm shadow-sm focus-visible:outline-2 focus-visible:outline-violet-600"
          onClick={() => setZen(false)}
        >
          Exit zen · Esc
        </button>
      )}
      {panel && (
        <section
          aria-label={
            panel === "summary"
              ? "Drawing elements"
              : panel === "layout"
                ? "Arrange selection"
                : panel === "library"
                  ? "Personal library"
                  : "Find text"
          }
          className="editor-extra-panel fixed bottom-36 right-4 z-[70] max-h-[min(32rem,70dvh)] w-[min(23rem,calc(100vw-2rem))] overflow-auto rounded-xl border border-neutral-200 bg-white p-4 shadow-lg"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">
              {panel === "summary"
                ? "Drawing elements"
                : panel === "layout"
                  ? "Arrange selection"
                  : panel === "library"
                    ? "Your library"
                    : "Find text"}
            </h2>
            <button className={button} aria-label="Close panel" onClick={close}>
              Close
            </button>
          </div>
          {panel === "layout" && !readOnly && (
            <>
              <div className="grid grid-cols-2 gap-1">
                {actions.map((a) => (
                  <button
                    key={a}
                    className={button}
                    disabled={
                      selection.size <
                      (a === "horizontal" || a === "vertical" ? 3 : 2)
                    }
                    onClick={() => applyLayout(a)}
                  >
                    {a === "horizontal" || a === "vertical"
                      ? `Distribute ${a}ly`
                      : `Align ${a}`}
                  </button>
                ))}
              </div>
              <label className="mt-3 flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={snap}
                  onChange={(e) => {
                    writeSnapPreference(e.target.checked);
                    snappingPreference.enabled = e.target.checked;
                    localStorage.setItem(
                      "editor-object-snap",
                      String(e.target.checked),
                    );
                  }}
                />
                Snap to elements (hold Alt to bypass)
              </label>
            </>
          )}
          {panel === "search" && (
            <>
              <label className="block text-sm">
                Search text
                <input
                  ref={input}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="mt-2 min-h-11 w-full rounded-md border border-neutral-300 px-3 focus:outline-2 focus:outline-violet-600"
                />
              </label>
              <p role="status" className="my-3 text-sm text-neutral-600">
                {query.trim()
                  ? `${results.length} results`
                  : "Enter text to find it in your drawing."}
              </p>
              {results.map((e) => (
                <button
                  key={e.id}
                  className={`${button} block w-full truncate text-left`}
                  onClick={() => jump(e.id)}
                >
                  {e.type === "text" ? e.text : e.type}
                </button>
              ))}
            </>
          )}
          {panel === "summary" && (
            <>
              <p className="mb-2 text-sm text-neutral-600">
                {elements.length} elements. Select an item to navigate to it.
              </p>
              <ul>
                {elements.map((e) => (
                  <li key={e.id}>
                    <button
                      className={`${button} block w-full truncate text-left`}
                      aria-pressed={selection.has(e.id)}
                      onClick={() => jump(e.id)}
                    >
                      {e.type === "text"
                        ? e.text
                        : e.type === "frame"
                          ? e.name || "Frame"
                          : `${e.type} ${e.id.slice(0, 6)}`}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {panel === "library" && (
            <>
              <p className="mb-3 text-sm text-neutral-600">
                {signedIn
                  ? "Private stamps saved to your account."
                  : "Stamps saved on this device. Sign in for an account library."}
              </p>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
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
                  onChange={(e) => setName(e.target.value)}
                  className="min-h-11 min-w-0 flex-1 rounded-md border border-neutral-300 px-3 text-sm focus:outline-2 focus:outline-violet-600"
                />
                <button
                  className={button}
                  disabled={busy || !selection.size || !name.trim()}
                >
                  Save
                </button>
              </form>
              <p className="mt-2 text-xs text-neutral-600">
                Select a group on the canvas before saving.
              </p>
              {!items.length && !busy && (
                <p className="my-6 text-sm">Your library is empty.</p>
              )}
              <ul className="mt-4 divide-y divide-neutral-100">
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
                        onSubmit={(e) => {
                          e.preventDefault();
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
                          onChange={(e) => setRenameName(e.target.value)}
                          className="min-h-11 min-w-0 rounded border px-2"
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
            </>
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
        </section>
      )}
    </>
  );
}
