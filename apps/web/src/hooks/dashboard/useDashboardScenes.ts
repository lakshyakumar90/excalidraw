import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { createScene, listScenes, type SceneSummary } from "@/lib/api/scenes";
import { errorMessage } from "@/lib/errors";

export function useDashboardScenes(userId: string) {
  const router = useRouter();
  const [result, setResult] = useState<{
    scenes: SceneSummary[];
    error: string;
  } | null>(null);
  const [actionError, setActionError] = useState("");
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<{ message: string } | null>(null);
  const changedScenes = useRef(new Map<string, SceneSummary | null>());

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    let cancelled = false;
    void listScenes().then(
      (scenes) => {
        if (!cancelled)
          setResult((current) => ({
            // Preserve actions completed while the initial list was loading.
            scenes: [
              ...(current?.scenes ?? []).filter(
                (saved) => !scenes.some((scene) => scene.id === saved.id),
              ),
              ...scenes,
            ]
              .filter((scene) => changedScenes.current.get(scene.id) !== null)
              .map((scene) => changedScenes.current.get(scene.id) ?? scene),
            error: "",
          }));
      },
      (error: unknown) => {
        if (!cancelled)
          setResult((current) => ({
            scenes: current?.scenes ?? [],
            error: errorMessage(error, "Could not load scenes"),
          }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function handleCreateScene() {
    setCreating(true);
    setActionError("");
    try {
      const created = await createScene("Untitled", {
        elements: [],
        appState: { scrollX: 0, scrollY: 0, zoom: { value: 1 } },
        files: {},
      });
      router.push(`/canvas/${encodeURIComponent(created.id)}`);
    } catch (error: unknown) {
      setActionError(errorMessage(error, "Could not create a scene"));
    } finally {
      setCreating(false);
    }
  }

  async function handleSignOut() {
    setActionError("");
    try {
      const result = await authClient.signOut();
      if (result.error)
        throw new Error(result.error.message ?? "Could not sign out");
    } catch (error: unknown) {
      setActionError(errorMessage(error, "Could not sign out"));
    }
  }

  return {
    addSavedScene: (saved: SceneSummary) => {
      changedScenes.current.set(saved.id, saved);
      setResult((current) => ({
        scenes: [
          saved,
          ...(current?.scenes ?? []).filter((scene) => scene.id !== saved.id),
        ],
        error: current?.error ?? "",
      }));
    },
    handleRenamed: (saved: SceneSummary) => {
      changedScenes.current.set(saved.id, saved);
      setResult(
        (current) =>
          current && {
            ...current,
            scenes: current.scenes.map((scene) =>
              scene.id === saved.id ? saved : scene,
            ),
          },
      );
      setNotice({ message: `Renamed scene to “${saved.title}”.` });
    },
    handleDeleted: (deleted: SceneSummary) => {
      changedScenes.current.set(deleted.id, null);
      setResult(
        (current) =>
          current && {
            ...current,
            scenes: current.scenes.filter((scene) => scene.id !== deleted.id),
          },
      );
      setNotice({ message: `Deleted “${deleted.title}”.` });
    },
    notice: notice?.message,
    scenes: result?.scenes ?? [],
    loadingScenes: result === null,
    error: actionError || result?.error || "",
    creating,
    handleCreateScene,
    handleSignOut,
  };
}
