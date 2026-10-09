"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
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
  const params = useParams<{ sceneId: string }>();
  const sceneId = params.sceneId;
  const [savedScene, setSavedScene] = useState<SavedScene | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void getScene(sceneId)
      .then(async (scene) => {
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
  }, [sceneId]);

  if (savedScene) {
    return (
      <CanvasWorkspace
        key={savedScene.id}
        savedScene={{
          id: savedScene.id,
          title: savedScene.title,
          elements: savedScene.data.elements as Element[],
          viewport: viewportFromSceneData(savedScene.data),
        }}
      />
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#faf9f6] px-5 text-neutral-900">
      <section className="max-w-md rounded-2xl border border-neutral-200 bg-white p-7 text-center shadow-sm">
        <h1 className="text-xl font-semibold">
          {error ? "Could not open this scene" : "Loading scene…"}
        </h1>
        {error && <p className="mt-3 text-sm text-neutral-600">{error}</p>}
        <Link
          href="/dashboard"
          className="mt-5 inline-flex rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
        >
          Back to your scenes
        </Link>
      </section>
    </main>
  );
}
