"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@repo/auth/client";
import { GuestDrawingOffer } from "@/components/dashboard/GuestDrawingOffer";
import { ChitranBrand } from "@/components/brand/ChitranLogo";
import { SelectDropdown } from "@/components/ui/SelectDropdown";
import {
  BOARD_PRESET_LIST,
  type BoardPresetId,
} from "@repo/common";
import { useCanvasTheme } from "@/lib/theme";
import {
  createScene,
  deleteScene,
  getScene,
  listScenes,
  renameScene,
  type SceneSummary,
} from "@/lib/api/scenes";

type FilterRole = "all" | "owned" | "shared" | "recent";
type ViewMode = "grid" | "list";

function boardHref(board: SceneSummary) {
  return board.roomId ? `/room/${board.roomId}/canvas` : `/canvas/${encodeURIComponent(board.id)}`;
}

export default function MyBoardsPage() {
  const router = useRouter();
  const { data: session, isPending: authPending } = authClient.useSession();
  const userId = session?.user.id;
  const { theme, setTheme, toggleTheme } = useCanvasTheme();
  const [boards, setBoards] = useState<SceneSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<FilterRole>("all");
  const [presetFilter, setPresetFilter] = useState<BoardPresetId | "all">("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  // New Board modal state
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("Untitled Board");
  const [newPreset, setNewPreset] = useState<BoardPresetId>("excali-font");
  const [newTheme, setNewTheme] = useState<"dark" | "light">(theme);
  const [creating, setCreating] = useState(false);

  // Rename, delete & 3-dot menu state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [mountNow] = useState(() => Date.now());

  useEffect(() => {
    if (authPending) return;
    if (!userId) {
      const returnTo = `/boards${window.location.search}`;
      router.replace(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }
    let active = true;
    void listScenes(true)
      .then((items) => {
        if (active) setBoards(items);
      })
      .catch((err: unknown) => {
        if (active)
          setError(err instanceof Error ? err.message : "Could not load boards.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [authPending, router, userId]);

  const filteredBoards = useMemo(() => {
    const q = search.trim().toLowerCase();
    return boards.filter((board) => {
      if (q && !(board.title || "Untitled").toLowerCase().includes(q)) {
        return false;
      }
      if (roleFilter === "recent") {
        const updated = new Date(board.updatedAt).getTime();
        const sevenDaysAgo = mountNow - 7 * 24 * 60 * 60 * 1000;
        if (updated < sevenDaysAgo) return false;
      }
      if (roleFilter === "owned" && board.role === "shared") return false;
      if (roleFilter === "shared" && board.role !== "shared") return false;
      if (presetFilter !== "all" && (board.preset ?? "excali-font") !== presetFilter) return false;
      return true;
    });
  }, [boards, search, roleFilter, presetFilter, mountNow]);

  async function handleCreateBoard() {
    setCreating(true);
    setError("");
    try {
      setTheme(newTheme);
      const created = await createScene(newTitle.trim() || "Untitled Board", {
        elements: [],
        appState: { boardPreset: newPreset, theme: newTheme },
      });
      setBoards((prev) => [{ ...created, preset: newPreset }, ...prev]);
      setNewModalOpen(false);
      setNewTitle("Untitled Board");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create board.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDuplicate(board: SceneSummary) {
    try {
      const source = await getScene(board.id);
      const copy = await createScene(`${board.title || "Untitled"} (Copy)`, source.data);
      setBoards((prev) => [{ ...copy, preset: board.preset, thumbnail: board.thumbnail }, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to duplicate board.");
    }
  }

  async function handleRename(id: string) {
    const title = renameDraft.trim();
    if (!title) return;
    try {
      const updated = await renameScene(id, title);
      setBoards((prev) => prev.map((b) => (b.id === id ? { ...b, title: updated.title, updatedAt: updated.updatedAt } : b)));
      setRenamingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename board.");
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteScene(id);
      setBoards((prev) => prev.filter((b) => b.id !== id));
      setDeletingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete board.");
    }
  }

  return (
    <main className="dashboard-page min-h-dvh bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <header className="dashboard-topbar">
        <Link href="/" className="dashboard-brand">
          <ChitranBrand />
        </Link>
        <nav className="dashboard-topbar-nav" aria-label="Boards navigation">
          <Link href="/boards" className="!text-[var(--text-primary)]">My Boards</Link>
          <Link href="/dashboard">Workspace &amp; Rooms</Link>
        </nav>
        <div className="flex items-center justify-self-end gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
          <button
            type="button"
            onClick={() => setNewModalOpen(true)}
            className="h-9 rounded-xl bg-[var(--accent)] px-3.5 text-xs font-semibold text-[var(--accent-fg)] transition hover:bg-[var(--accent-hover)]"
          >
            + New Board
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-7">
        {userId && <GuestDrawingOffer userId={userId} onSaved={(saved) =>
          setBoards((current) => [saved, ...current.filter((board) => board.id !== saved.id)])
        } />}
        {/* Search & filters */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex h-9 min-w-[220px] flex-1 max-w-sm items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 transition focus-within:border-[var(--border-soft)]">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search boards by title…"
              className="w-full border-0 bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:outline-none focus-visible:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {(["all", "owned", "shared", "recent"] as FilterRole[]).map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => setRoleFilter(role)}
                className={`h-9 rounded-xl px-3 font-medium capitalize transition-colors ${
                  roleFilter === role
                    ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                    : "border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                }`}
              >
                {role === "shared" ? "Shared with me" : role}
              </button>
            ))}

            <SelectDropdown
              ariaLabel="Filter by board preset"
              value={presetFilter}
              onChange={(val) => setPresetFilter(val as BoardPresetId | "all")}
              options={[
                { value: "all", label: "All presets" },
                ...BOARD_PRESET_LIST.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />

            <div className="flex h-9 items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`h-full rounded-lg px-2.5 text-xs font-medium transition ${
                  viewMode === "grid"
                    ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                Grid
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`h-full rounded-lg px-2.5 text-xs font-medium transition ${
                  viewMode === "list"
                    ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                List
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading boards">
            {[1, 2, 3].map((n) => (
              <div key={n} className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                <div className="aspect-video animate-pulse bg-[var(--bg-elevated)]" />
                <div className="space-y-2 p-4">
                  <div className="h-3.5 w-32 animate-pulse rounded bg-[var(--bg-hover)]" />
                  <div className="h-2.5 w-24 animate-pulse rounded bg-[var(--bg-elevated)]" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredBoards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)] py-16 text-center">
            <p className="text-sm text-[var(--text-muted)]">
              No boards match your filter yet.
            </p>
            <button
              type="button"
              onClick={() => setNewModalOpen(true)}
              className="mt-4 rounded-xl bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-fg)] transition hover:bg-[var(--accent-hover)]"
            >
              Create your first board
            </button>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredBoards.map((board) => (
              <article
                key={board.id}
                className="group relative flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] transition hover:border-[var(--border-soft)]"
              >
                <Link
                  href={boardHref(board)}
                  className="flex aspect-video items-center justify-center overflow-hidden rounded-t-2xl border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                >
                  {board.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={board.thumbnail}
                      alt=""
                      className={`h-full w-full object-cover ${
                        theme !== (board.thumbnailTheme ?? "dark")
                          ? "invert hue-rotate-180 opacity-90"
                          : ""
                      }`}
                    />
                  ) : (
                    <span className="font-mono text-xs text-[var(--text-muted)] transition group-hover:text-[var(--text-primary)]">
                      Open Canvas →
                    </span>
                  )}
                </Link>
                <div className="flex items-center justify-between gap-2 p-4">
                  {renamingId === board.id ? (
                    <div className="flex w-full items-center gap-1.5">
                      <input
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleRename(board.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        className="flex-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1 text-xs text-[var(--text-primary)] outline-none"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => void handleRename(board.id)}
                        className="rounded-lg bg-[var(--accent)] px-2.5 py-1 text-xs font-semibold text-[var(--accent-fg)]"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={boardHref(board)}
                          className="block truncate text-sm font-semibold text-[var(--text-primary)] hover:underline"
                        >
                          {board.title || "Untitled Board"}
                        </Link>
                        <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">
                          Updated {new Date(board.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                      {board.role !== "shared" && (
                        <div className="relative shrink-0">
                          <button
                            type="button"
                            aria-label="Board options"
                            onClick={() => setMenuId((curr) => (curr === board.id ? null : board.id))}
                            className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                          >
                            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                              <circle cx="5" cy="12" r="1.8" />
                              <circle cx="12" cy="12" r="1.8" />
                              <circle cx="19" cy="12" r="1.8" />
                            </svg>
                          </button>
                          {menuId === board.id && (
                            <div className="animate-pop-up absolute right-0 bottom-[calc(100%+6px)] z-30 w-36 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-1 text-xs shadow-2xl">
                              <button
                                type="button"
                                onClick={() => {
                                  setMenuId(null);
                                  setRenamingId(board.id);
                                  setRenameDraft(board.title || "");
                                }}
                                className="w-full rounded-lg px-2.5 py-1.5 text-left hover:bg-[var(--bg-hover)]"
                              >
                                Rename
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setMenuId(null);
                                  void handleDuplicate(board);
                                }}
                                className="w-full rounded-lg px-2.5 py-1.5 text-left hover:bg-[var(--bg-hover)]"
                              >
                                Duplicate
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (deletingId === board.id) {
                                    setMenuId(null);
                                    void handleDelete(board.id);
                                  } else {
                                    setDeletingId(board.id);
                                  }
                                }}
                                className="w-full rounded-lg px-2.5 py-1.5 text-left text-rose-400 hover:bg-rose-500/10"
                              >
                                {deletingId === board.id ? "Confirm delete" : "Delete"}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
            {filteredBoards.map((board) => (
              <div
                key={board.id}
                className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
              >
                <Link
                  href={boardHref(board)}
                  className="font-medium text-[var(--text-primary)] hover:underline"
                >
                  {board.title || "Untitled Board"}
                </Link>
                <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
                  <span>{new Date(board.updatedAt).toLocaleDateString()}</span>
                  {board.role !== "shared" && (
                    <button
                      type="button"
                      onClick={() => void handleDuplicate(board)}
                      className="hover:text-[var(--text-primary)]"
                    >
                      Duplicate
                    </button>
                  )}
                  {board.role !== "shared" && (
                    <button
                      type="button"
                      onClick={() => {
                        if (deletingId === board.id) void handleDelete(board.id);
                        else setDeletingId(board.id);
                      }}
                      className="hover:text-rose-400"
                    >
                      {deletingId === board.id ? "Confirm delete" : "Delete"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* New Board Modal (larger, click-outside to close) */}
      {newModalOpen && (
        <div
          className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs"
          onClick={() => setNewModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Create New Board"
            className="animate-pop-up w-full max-w-lg rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Create New Board</h2>
              <button
                type="button"
                onClick={() => setNewModalOpen(false)}
                aria-label="Close"
                className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 space-y-4 text-sm">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
                  Board Title
                </label>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-soft)]"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
                  Visual Preset
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {BOARD_PRESET_LIST.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setNewPreset(preset.id)}
                      className={`rounded-xl border p-3 text-left text-xs transition-colors ${
                        newPreset === preset.id
                          ? "border-[var(--accent)] bg-[var(--bg-surface)]"
                          : "border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:border-[var(--border-soft)]"
                      }`}
                    >
                      <div className="font-semibold text-[var(--text-primary)]">{preset.name}</div>
                      <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                        {preset.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
                  Canvas Theme
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(["dark", "light"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setNewTheme(mode)}
                      className={`rounded-xl border py-2.5 text-xs font-medium capitalize transition ${
                        newTheme === mode
                          ? "border-[var(--accent)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
                          : "border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-muted)]"
                      }`}
                    >
                      {mode} mode
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewModalOpen(false)}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={creating}
                onClick={() => void handleCreateBoard()}
                className="rounded-xl bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-fg)] transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create Board"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
