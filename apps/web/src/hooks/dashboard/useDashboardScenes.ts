import { useEffect, useState } from "react";
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

  useEffect(() => {
    let cancelled = false;
    void listScenes().then(
      (scenes) => {
        if (!cancelled) setResult({ scenes, error: "" });
      },
      (error: unknown) => {
        if (!cancelled)
          setResult({
            scenes: [],
            error: errorMessage(error, "Could not load scenes"),
          });
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
    scenes: result?.scenes ?? [],
    loadingScenes: result === null,
    error: actionError || result?.error || "",
    creating,
    handleCreateScene,
    handleSignOut,
  };
}
