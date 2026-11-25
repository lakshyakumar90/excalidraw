"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Element } from "@repo/common";
import { CanvasWorkspace } from "@/components/canvas/CanvasWorkspace";
import {
  getScene,
  viewportFromSceneData,
  type SavedScene,
} from "@/lib/api/scenes";
import { cacheSavedSceneFiles } from "@/lib/persistence/savedScene";

export default function SavedCanvasPage() {
  const router = useRouter();
  const params = useParams<{ sceneId: string }>();
  const sceneId = params.sceneId;
  const [savedScene, setSavedScene] = useState<SavedScene | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void getScene(sceneId)
      .then(async (scene) => {
        if (cancelled) return;
        if (scene.roomId != null) {
          // Enter the canonical room workspace before starting private autosave.
          router.replace(`/room/${encodeURIComponent(scene.roomId)}/canvas`);
          return;
        }
        await cacheSavedSceneFiles(scene.data.files);
        if (!cancelled) setSavedScene(scene);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(
            reason instanceof Error ? reason.message : "Could not load scene",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sceneId, router]);

  if (savedScene) {
    return (
      <CanvasWorkspace
        key={savedScene.id}
        savedScene={{
          id: savedScene.id,
          title: savedScene.title,
          elements: savedScene.data.elements as Element[],
          viewport: viewportFromSceneData(savedScene.data),
          appState: savedScene.data.appState,
          files: savedScene.data.files,
        }}
      />
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--bg-canvas)] px-5 text-[var(--text-primary)]">
      {error ? (
        <section className="animate-pop-up max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 text-center shadow-2xl">
          <h1 className="text-base font-semibold">Could not open this scene</h1>
          <p className="mt-2 text-xs text-[var(--text-muted)]">{error}</p>
          <Link
            href="/dashboard"
            className="mt-4 inline-flex rounded-xl bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-fg)] transition hover:bg-[var(--accent-hover)]"
          >
            Back to your scenes
          </Link>
        </section>
      ) : (
        <div
          className="w-full max-w-md space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6"
          role="status"
          aria-label="Loading scene"
        >
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 animate-pulse rounded-xl bg-[var(--bg-hover)]" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-32 animate-pulse rounded-md bg-[var(--bg-hover)]" />
              <div className="h-2.5 w-48 animate-pulse rounded-md bg-[var(--bg-elevated)]" />
            </div>
          </div>
          <div className="h-28 animate-pulse rounded-xl bg-[var(--bg-elevated)]" />
        </div>
      )}
    </main>
  );
}
