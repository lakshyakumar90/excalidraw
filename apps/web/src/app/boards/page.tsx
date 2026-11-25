"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BOARD_PRESET_LIST,
  type BoardPresetId,
} from "@repo/common";
import { useCanvasTheme } from "@/lib/theme";
import {
  createScene,
  deleteScene,
  listScenes,
  updateScene,
  type SceneSummary,
} from "@/lib/api/scenes";

type FilterRole = "all" | "owned" | "shared" | "recent";
type ViewMode = "grid" | "list";

export default function MyBoardsPage() {
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

  // Rename & delete state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void listScenes()
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
  }, []);

  const filteredBoards = useMemo(() => {
    const q = search.trim().toLowerCase();
    return boards.filter((board) => {
      if (q && !(board.title || "Untitled").toLowerCase().includes(q)) {
        return false;
      }
      if (roleFilter === "recent") {
        const updated = new Date(board.updatedAt).getTime();
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        if (updated < sevenDaysAgo) return false;
      }
      return true;
    });
  }, [boards, search, roleFilter]);

  async function handleCreateBoard() {
    setCreating(true);
    setError("");
    try {
      setTheme(newTheme);
      const created = await createScene({
        title: newTitle.trim() || "Untitled Board",
        data: {
          elements: [],
          appState: { boardPreset: newPreset, theme: newTheme },
        },
      });
      setBoards((prev) => [created, ...prev]);
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
      const copy = await createScene({
        title: `${board.title || "Untitled"} (Copy)`,
        data: { elements: [] },
      });
      setBoards((prev) => [copy, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to duplicate board.");
    }
  }

  async function handleRename(id: string) {
    const title = renameDraft.trim();
    if (!title) return;
    try {
      const updated = await updateScene(id, { title });
      setBoards((prev) => prev.map((b) => (b.id === id ? updated : b)));
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
    <main className="min-h-dvh bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <header className="sticky top-0 z-20 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/90 px-6 py-3.5 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-sm font-bold text-white">
                E
              </span>
              <span>My Boards</span>
            </Link>
            <Link
              href="/dashboard"
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              Rooms &amp; Invites
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              {theme === "dark" ? "☀ Light" : "☾ Dark"}
            </button>
            <button
              type="button"
              onClick={() => setNewModalOpen(true)}
              className="rounded-full bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[var(--accent-hover)]"
            >
              + New Board
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-8">
        {/* Search & filters */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-1 min-w-[220px] max-w-md items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search boards by title…"
              className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {(["all", "owned", "shared", "recent"] as FilterRole[]).map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => setRoleFilter(role)}
                className={`rounded-full px-3 py-1.5 font-medium capitalize transition-colors ${
                  roleFilter === role
                    ? "bg-[var(--accent)] text-white"
                    : "border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                {role === "shared" ? "Shared with me" : role}
              </button>
            ))}

            <select
              aria-label="Filter by board preset"
              value={presetFilter}
              onChange={(e) =>
                setPresetFilter(e.target.value as BoardPresetId | "all")
              }
              className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
            >
              <option value="all">All presets</option>
              {BOARD_PRESET_LIST.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <div className="flex rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`rounded-full px-2.5 py-1 ${
                  viewMode === "grid"
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--text-muted)]"
                }`}
              >
                Grid
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`rounded-full px-2.5 py-1 ${
                  viewMode === "list"
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--text-muted)]"
                }`}
              >
                List
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-sm text-[var(--text-muted)]">
            Loading your boards…
          </div>
        ) : filteredBoards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)] py-16 text-center">
            <p className="text-sm text-[var(--text-muted)]">
              No boards match your filter yet.
            </p>
            <button
              type="button"
              onClick={() => setNewModalOpen(true)}
              className="mt-4 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white"
            >
              Create your first board
            </button>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredBoards.map((board) => (
              <article
                key={board.id}
                className="group flex flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] transition-shadow hover:shadow-lg"
              >
                <Link
                  href={`/canvas/${encodeURIComponent(board.id)}`}
                  className="flex aspect-video items-center justify-center bg-[var(--bg-surface)] border-b border-[var(--border-subtle)]"
                >
                  <span className="text-xs font-mono text-[var(--text-muted)]">
                    Open Canvas →
                  </span>
                </Link>
                <div className="flex flex-col gap-2 p-4">
                  {renamingId === board.id ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleRename(board.id);
                        }}
                        className="flex-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 text-xs"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => void handleRename(board.id)}
                        className="rounded-lg bg-[var(--accent)] px-2.5 py-1 text-xs text-white"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/canvas/${encodeURIComponent(board.id)}`}
                        className="truncate text-sm font-semibold hover:text-[var(--accent)]"
                      >
                        {board.title || "Untitled Board"}
                      </Link>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                    <span>
                      Updated {new Date(board.updatedAt).toLocaleDateString()}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingId(board.id);
                          setRenameDraft(board.title || "");
                        }}
                        className="hover:text-[var(--text-primary)]"
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDuplicate(board)}
                        className="hover:text-[var(--text-primary)]"
                      >
                        Duplicate
                      </button>
                      {deletingId === board.id ? (
                        <button
                          type="button"
                          onClick={() => void handleDelete(board.id)}
                          className="font-semibold text-rose-400"
                        >
                          Confirm?
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeletingId(board.id)}
                          className="hover:text-rose-400"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
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
                  href={`/canvas/${encodeURIComponent(board.id)}`}
                  className="font-medium hover:text-[var(--accent)]"
                >
                  {board.title || "Untitled Board"}
                </Link>
                <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
                  <span>{new Date(board.updatedAt).toLocaleDateString()}</span>
                  <button
                    type="button"
                    onClick={() => void handleDuplicate(board)}
                    className="hover:text-[var(--text-primary)]"
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(board.id)}
                    className="hover:text-rose-400"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* New Board Modal */}
      {newModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 shadow-2xl">
            <h2 className="text-lg font-semibold">Create New Board</h2>
            <div className="mt-4 space-y-4 text-sm">
              <div>
                <label className="mb-1 block text-xs text-[var(--text-muted)]">
                  Board Title
                </label>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-[var(--text-muted)]">
                  Visual Preset
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {BOARD_PRESET_LIST.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setNewPreset(preset.id)}
                      className={`rounded-xl border p-2.5 text-left text-xs transition-colors ${
                        newPreset === preset.id
                          ? "border-[var(--accent)] bg-[var(--accent)]/15"
                          : "border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                      }`}
                    >
                      <div className="font-semibold">{preset.name}</div>
                      <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                        {preset.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-[var(--text-muted)]">
                  Canvas Theme
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(["dark", "light"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setNewTheme(mode)}
                      className={`rounded-xl border py-2 text-xs font-medium capitalize ${
                        newTheme === mode
                          ? "border-[var(--accent)] bg-[var(--accent)]/15"
                          : "border-[var(--border-subtle)] bg-[var(--bg-surface)]"
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
                className="rounded-full border border-[var(--border-subtle)] px-4 py-1.5 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={creating}
                onClick={() => void handleCreateBoard()}
                className="rounded-full bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
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
