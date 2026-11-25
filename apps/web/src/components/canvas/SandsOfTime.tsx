"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Element } from "@repo/common";
import { scene } from "@/lib/scene/scene";

export interface SandsStep {
  elements: Element[];
  label: string;
  elapsedSec: number;
}

export interface SandsRecording {
  id: string;
  name: string;
  durationSec: number;
  steps: SandsStep[];
}

const STORAGE_KEY = "chitran:sands-recordings";

function loadRecordings(): SandsRecording[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SandsRecording[]) : [];
  } catch {
    return [];
  }
}

function saveRecordings(items: SandsRecording[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 10)));
  } catch {
    // Ignore quota errors.
  }
}

function cloneElements(els: readonly Element[]): Element[] {
  return JSON.parse(JSON.stringify(els.filter((e) => !e.isDeleted))) as Element[];
}

function applySnapshot(snapshot: readonly Element[]) {
  const current = scene.getElements();
  for (const el of current) {
    scene.removeElement(el.id);
  }
  for (const el of snapshot) {
    scene.addElement({ ...el, isDeleted: false });
  }
}

export function SandsOfTime({
  open,
  onClose,
  onCountChange,
  drawerOffsetClass = "right-14",
}: {
  open: boolean;
  onClose: () => void;
  onCountChange?: (count: number) => void;
  drawerOffsetClass?: string;
}) {
  const [recordings, setRecordings] = useState<SandsRecording[]>(loadRecordings);
  const [recording, setRecording] = useState(false);
  const [draftSteps, setDraftSteps] = useState<SandsStep[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const recordStartRef = useRef<number>(0);
  const originalBoardRef = useRef<Element[] | null>(null);

  useEffect(() => {
    onCountChange?.(recordings.length);
  }, [recordings.length, onCountChange]);

  // Capture canvas commits while recording
  useEffect(() => {
    if (!recording) return;
    return scene.onCommit((commit) => {
      const elapsedSec = Math.max(
        1,
        Math.round((Date.now() - recordStartRef.current) / 1000),
      );
      const label =
        commit.elements.length === 1 ? "Updated element" : `Updated ${commit.elements.length} elements`;
      setDraftSteps((prev) => [
        ...prev,
        {
          elements: cloneElements(scene.getElements()),
          label,
          elapsedSec,
        },
      ]);
    });
  }, [recording]);

  const activeRecording = recordings.find((r) => r.id === playingId) ?? null;

  const exitPlayback = useCallback(() => {
    setIsPlaying(false);
    setPlayingId(null);
    if (originalBoardRef.current) {
      applySnapshot(originalBoardRef.current);
      originalBoardRef.current = null;
    }
  }, []);

  // Playback timer
  useEffect(() => {
    if (!activeRecording || !isPlaying) return;
    const delay = speed === 2 ? 450 : 900;
    const timer = window.setInterval(() => {
      setStepIndex((prev) => {
        const next = prev + 1;
        if (next >= activeRecording.steps.length) {
          setIsPlaying(false);
          return prev;
        }
        applySnapshot(activeRecording.steps[next]!.elements);
        return next;
      });
    }, delay);
    return () => window.clearInterval(timer);
  }, [activeRecording, isPlaying, speed]);

  // Keyboard shortcuts during playback
  useEffect(() => {
    if (!activeRecording) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        exitPlayback();
      } else if (e.key === " ") {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIsPlaying(false);
        setStepIndex((prev) => {
          const next = Math.max(0, prev - 1);
          applySnapshot(activeRecording.steps[next]!.elements);
          return next;
        });
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setIsPlaying(false);
        setStepIndex((prev) => {
          const next = Math.min(activeRecording.steps.length - 1, prev + 1);
          applySnapshot(activeRecording.steps[next]!.elements);
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeRecording, exitPlayback]);

  function startRecording() {
    recordStartRef.current = Date.now();
    setDraftSteps([
      {
        elements: cloneElements(scene.getElements()),
        label: "Initial state",
        elapsedSec: 0,
      },
    ]);
    setRecording(true);
    onClose();
  }

  function stopRecording() {
    setRecording(false);
    const durationSec = Math.max(
      1,
      Math.round((Date.now() - recordStartRef.current) / 1000),
    );
    const nextItem: SandsRecording = {
      id: `sands-${Date.now().toString(36)}`,
      name: `Sands ${recordings.length + 1}`,
      durationSec,
      steps:
        draftSteps.length > 0
          ? draftSteps
          : [{ elements: cloneElements(scene.getElements()), label: "Snapshot", elapsedSec: durationSec }],
    };
    const updated = [nextItem, ...recordings];
    setRecordings(updated);
    saveRecordings(updated);
    setDraftSteps([]);
  }

  function startPlayback(rec: SandsRecording) {
    if (rec.steps.length === 0) return;
    originalBoardRef.current = cloneElements(scene.getElements());
    setPlayingId(rec.id);
    setStepIndex(0);
    setIsPlaying(true);
    applySnapshot(rec.steps[0]!.elements);
    onClose();
  }

  function jumpToStep(idx: number) {
    if (!activeRecording) return;
    const clamped = Math.max(0, Math.min(activeRecording.steps.length - 1, idx));
    setStepIndex(clamped);
    applySnapshot(activeRecording.steps[clamped]!.elements);
  }

  function commitRename(id: string) {
    const trimmed = editingName.trim();
    if (trimmed) {
      const updated = recordings.map((rec) =>
        rec.id === id ? { ...rec, name: trimmed } : rec,
      );
      setRecordings(updated);
      saveRecordings(updated);
    }
    setEditingId(null);
    setEditingName("");
  }

  function deleteRecording(id: string) {
    if (playingId === id) {
      exitPlayback();
    }
    const updated = recordings.filter((rec) => rec.id !== id);
    setRecordings(updated);
    saveRecordings(updated);
    if (editingId === id) {
      setEditingId(null);
      setEditingName("");
    }
  }

  return (
    <>
      {/* Live recording indicator pill */}
      {recording && (
        <div
          data-editor-chrome
          className="animate-pop-up fixed top-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2.5 rounded-xl border border-rose-500/40 bg-[var(--bg-elevated)]/95 px-3 py-1.5 text-xs text-[var(--text-primary)] shadow-2xl backdrop-blur-md"
        >
          <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
          <span className="font-medium">Recording Sands ({draftSteps.length} steps)</span>
          <button
            type="button"
            onClick={stopRecording}
            className="rounded-lg bg-rose-500 px-2.5 py-0.5 text-[11px] font-semibold text-white transition hover:bg-rose-600"
          >
            Stop
          </button>
        </div>
      )}

      {/* Popover beside Hourglass dock (Image 1) */}
      {open && !activeRecording && (
        <div
          data-editor-chrome
          className={`animate-pop-up fixed top-24 ${drawerOffsetClass} z-50 w-72 rounded-2xl border border-amber-500/25 bg-[var(--bg-elevated)]/95 p-3.5 text-xs text-[var(--text-primary)] shadow-2xl backdrop-blur-md`}
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-amber-400">⏳</span>
              <span className="text-[11px] font-semibold tracking-wider text-amber-400 uppercase">
                Sands of Time
              </span>
              <span className="grid h-4 min-w-4 place-items-center rounded-full bg-amber-500/20 px-1 text-[10px] font-bold text-amber-300">
                {recordings.length}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Sands of Time"
              className="grid h-6 w-6 place-items-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              ✕
            </button>
          </div>

          {recordings.length === 0 ? (
            <p className="mb-3 text-[11px] text-[var(--text-muted)]">
              Record your drawing steps and replay them anytime.
            </p>
          ) : (
            <ul className="mb-3 max-h-48 space-y-1.5 overflow-y-auto">
              {recordings.map((rec) => (
                <li
                  key={rec.id}
                  className="group flex items-center justify-between gap-1.5 rounded-xl px-2 py-1.5 transition hover:bg-[var(--bg-hover)]"
                >
                  {editingId === rec.id ? (
                    <form
                      className="flex flex-1 items-center gap-1.5"
                      onSubmit={(e) => {
                        e.preventDefault();
                        commitRename(rec.id);
                      }}
                    >
                      <input
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            setEditingId(null);
                            setEditingName("");
                          }
                        }}
                        aria-label="Recording name"
                        className="h-7 min-w-0 flex-1 rounded-lg border border-[var(--border-soft)] bg-[var(--bg-canvas)] px-2 text-xs text-[var(--text-primary)] outline-none"
                      />
                      <button
                        type="submit"
                        className="cursor-pointer rounded-lg bg-[var(--accent)] px-2 py-1 text-[10px] font-semibold text-[var(--accent-fg)]"
                      >
                        Save
                      </button>
                    </form>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => startPlayback(rec)}
                        className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 text-left"
                      >
                        <span className="flex min-w-0 items-center gap-2 font-medium text-[var(--text-primary)]">
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-500/20 text-[10px] text-amber-400">
                            ▶
                          </span>
                          <span className="truncate">{rec.name}</span>
                        </span>
                        <span className="shrink-0 text-[11px] text-[var(--text-muted)]">
                          {rec.steps.length} steps · {rec.durationSec}s
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          aria-label={`Rename ${rec.name}`}
                          title="Rename recording"
                          onClick={() => {
                            setEditingId(rec.id);
                            setEditingName(rec.name);
                          }}
                          className="grid h-6 w-6 cursor-pointer place-items-center rounded-md text-[var(--text-muted)] transition hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
                        >
                          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11.5 2.5a1.5 1.5 0 0 1 2.1 2.1L5.2 13l-2.7.5.5-2.7 8.5-8.3Z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${rec.name}`}
                          title="Delete recording"
                          onClick={() => deleteRecording(rec.id)}
                          className="grid h-6 w-6 cursor-pointer place-items-center rounded-md text-[var(--text-muted)] transition hover:bg-rose-500/15 hover:text-rose-400"
                        >
                          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 4.5h10M6 4.5V3h4v1.5M5 4.5l.5 8.5h5l.5-8.5" />
                          </svg>
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-soft)] bg-[var(--bg-surface)] py-2 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)]"
          >
            <span className={`h-2 w-2 rounded-full ${recording ? "animate-pulse bg-rose-500" : "bg-rose-500"}`} />
            <span>{recording ? "Stop recording" : "Record new"}</span>
          </button>
        </div>
      )}

      {/* Playback Mode Chrome (Image 2) */}
      {activeRecording && (
        <>
          <div
            data-editor-chrome
            className="animate-pop-up fixed top-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/95 px-3.5 py-1.5 text-xs shadow-2xl backdrop-blur-md"
          >
            <span className="flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <span>{activeRecording.name}</span>
            </span>
            <span className="h-3 w-px bg-[var(--border-subtle)]" />
            <span className="hidden items-center gap-2 text-[11px] text-[var(--text-muted)] sm:flex">
              <kbd className="rounded border border-[var(--border-subtle)] px-1 font-mono text-[10px]">← →</kbd> step
              <kbd className="rounded border border-[var(--border-subtle)] px-1 font-mono text-[10px]">Space</kbd> play
              <kbd className="rounded border border-[var(--border-subtle)] px-1 font-mono text-[10px]">Esc</kbd> exit
            </span>
          </div>

          <div
            data-editor-chrome
            className="animate-pop-up fixed bottom-3 left-1/2 z-50 flex w-[min(34rem,calc(100vw-1.5rem))] -translate-x-1/2 items-center gap-2.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/95 px-3 py-2 text-xs text-[var(--text-primary)] shadow-2xl backdrop-blur-md"
          >
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                jumpToStep(0);
              }}
              aria-label="First step"
              className="grid h-7 w-7 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              |◀
            </button>
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                jumpToStep(stepIndex - 1);
              }}
              aria-label="Previous step"
              className="grid h-7 w-7 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              ◀
            </button>
            <button
              type="button"
              onClick={() => {
                if (!isPlaying && stepIndex >= activeRecording.steps.length - 1) {
                  jumpToStep(0);
                }
                setIsPlaying((p) => !p);
              }}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-400 text-xs font-bold text-black transition hover:bg-amber-300"
            >
              {isPlaying ? "⏸" : "▶"}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                jumpToStep(stepIndex + 1);
              }}
              aria-label="Next step"
              className="grid h-7 w-7 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              ▶
            </button>

            <span className="font-mono text-[11px] tabular-nums text-[var(--text-primary)]">
              {stepIndex + 1}/{activeRecording.steps.length}
            </span>

            <input
              aria-label="Playback progress"
              type="range"
              min={0}
              max={Math.max(0, activeRecording.steps.length - 1)}
              value={stepIndex}
              onChange={(e) => {
                setIsPlaying(false);
                jumpToStep(Number(e.target.value));
              }}
              className="min-w-0 flex-1 accent-amber-400"
            />

            <span className="hidden truncate text-[11px] text-[var(--text-muted)] sm:inline">
              {activeRecording.steps[stepIndex]?.label ?? "Step"}
            </span>

            <button
              type="button"
              onClick={() => setSpeed((s) => (s === 1 ? 2 : 1))}
              className="rounded-lg border border-[var(--border-subtle)] px-2 py-0.5 font-mono text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            >
              {speed}×
            </button>

            <button
              type="button"
              onClick={exitPlayback}
              aria-label="Exit playback"
              className="grid h-7 w-7 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              ✕
            </button>
          </div>
        </>
      )}
    </>
  );
}
