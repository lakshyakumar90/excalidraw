"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api/client";

export interface SceneRevisionEntry {
  revision: number;
  actorId: string;
  createdAt: string;
  elementCount: number;
}

export interface VersionHistoryDrawerProps {
  open: boolean;
  sceneId?: string;
  onClose: () => void;
  onPreviewRevision?: (revision: number) => void;
  onRestored?: (newRevision: number) => void;
}

export function VersionHistoryDrawer({
  open,
  sceneId,
  onClose,
  onPreviewRevision,
  onRestored,
}: VersionHistoryDrawerProps) {
  const [revisions, setRevisions] = useState<SceneRevisionEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringRev, setRestoringRev] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !sceneId) return;
    let active = true;
    setLoading(true);
    setError("");
    void fetch(apiUrl(`/api/revisions/${encodeURIComponent(sceneId)}`), {
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to fetch history (${res.status})`);
        return (await res.json()) as { revisions: SceneRevisionEntry[] };
      })
      .then((data) => {
        if (active) setRevisions(data.revisions ?? []);
      })
      .catch((err: unknown) => {
        if (active)
          setError(err instanceof Error ? err.message : "Could not load history.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, sceneId]);

  if (!open) return null;

  async function handleRestore(revision: number) {
    if (!sceneId) return;
    setRestoringRev(revision);
    setError("");
    try {
      const res = await fetch(
        apiUrl(
          `/api/revisions/${encodeURIComponent(sceneId)}/${revision}/restore`,
        ),
        {
          method: "POST",
          credentials: "include",
        },
      );
      if (!res.ok) throw new Error(`Restore failed (${res.status})`);
      const data = (await res.json()) as { newRevision: number };
      onRestored?.(data.newRevision);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not restore revision.");
    } finally {
      setRestoringRev(null);
    }
  }

  return (
    <aside
      data-editor-chrome
      aria-label="Version History"
      className="fixed bottom-4 right-4 top-16 z-50 flex w-80 flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/95 shadow-2xl backdrop-blur-md"
    >
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Version History
          </h2>
          <p className="text-[11px] text-[var(--text-muted)]">
            Up to 20 saved Postgres snapshots
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Version History"
          className="rounded-lg px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-surface)]"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {error && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-2.5 text-xs text-rose-300">
            {error}
          </div>
        )}
        {!sceneId ? (
          <p className="p-3 text-xs text-[var(--text-muted)]">
            Save or open a cloud board to inspect its revision history.
          </p>
        ) : loading ? (
          <p className="p-3 text-xs text-[var(--text-muted)]">
            Loading revisions…
          </p>
        ) : revisions.length === 0 ? (
          <p className="p-3 text-xs text-[var(--text-muted)]">
            No revisions recorded yet.
          </p>
        ) : (
          revisions.map((entry, idx) => (
            <div
              key={entry.revision}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[var(--text-primary)]">
                  Revision #{entry.revision}
                  {idx === 0 && (
                    <span className="ml-1.5 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">
                      Latest
                    </span>
                  )}
                </span>
                <span className="text-[11px] text-[var(--text-muted)]">
                  {entry.elementCount} elements
                </span>
              </div>
              <div className="mt-1 text-[11px] text-[var(--text-muted)]">
                {new Date(entry.createdAt).toLocaleString()}
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                {onPreviewRevision && (
                  <button
                    type="button"
                    onClick={() => onPreviewRevision(entry.revision)}
                    className="rounded-lg border border-[var(--border-subtle)] px-2.5 py-1 text-[11px] hover:bg-[var(--bg-elevated)]"
                  >
                    Preview
                  </button>
                )}
                {idx > 0 && (
                  <button
                    type="button"
                    disabled={restoringRev === entry.revision}
                    onClick={() => void handleRestore(entry.revision)}
                    className="rounded-lg bg-[var(--accent)] px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50"
                  >
                    {restoringRev === entry.revision
                      ? "Restoring…"
                      : "Restore as new revision"}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
