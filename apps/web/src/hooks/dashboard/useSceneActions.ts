import { useRef, useState } from "react";
import { deleteScene, renameScene, type SceneSummary } from "@/lib/api/scenes";
import { errorMessage } from "@/lib/errors";

export function useSceneActions(
  scene: SceneSummary,
  onRenamed: (scene: SceneSummary) => void,
  onDeleted: (scene: SceneSummary) => void,
) {
  const [mode, setMode] = useState<"rename" | "delete" | null>(null);
  const [title, setTitle] = useState(scene.title);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);

  function open(next: "rename" | "delete") {
    if (busy.current) return;
    setTitle(scene.title);
    setError("");
    setMode(next);
  }

  function cancel() {
    if (busy.current) return;
    setMode(null);
    setError("");
  }

  async function submit() {
    if (!mode || busy.current) return;
    const trimmed = title.trim();
    if (mode === "rename" && (!trimmed || trimmed.length > 120)) {
      setError("Enter a scene name between 1 and 120 characters.");
      return;
    }
    if (mode === "rename" && trimmed === scene.title) {
      cancel();
      return;
    }
    busy.current = true;
    setPending(true);
    setError("");
    try {
      if (mode === "rename") {
        const saved = await renameScene(scene.id, trimmed);
        onRenamed(saved);
        setMode(null);
      } else {
        await deleteScene(scene.id);
        onDeleted(scene);
      }
    } catch (error) {
      setError(
        errorMessage(
          error,
          mode === "rename"
            ? "Could not rename the scene. Try again."
            : "Could not delete the scene. Try again.",
        ),
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return { mode, title, setTitle, pending, error, open, cancel, submit };
}
