import { useEffect, useRef, useState, type RefObject } from "react";
import type { Viewport } from "@repo/common";
import { clampZoom } from "@repo/engine";
import type { SavedCanvasScene } from "@/lib/canvas/types";
import { scene } from "@/lib/scene/scene";
import { selectionStore } from "@/lib/selection/selectionStore";
import { startAutosave, type AutosaveHandle } from "@/lib/persistence/autosave";
import { loadScene } from "@/lib/persistence/indexedDb";
import { buildSavedSceneData } from "@/lib/persistence/savedScene";
import { updateSceneData } from "@/lib/api/scenes";
import { setCurrentViewport } from "@/lib/persistence/viewportStore";

export function useCanvasPersistence(
  savedScene: SavedCanvasScene | undefined,
  viewportRef: RefObject<Viewport>,
) {
  const [readyFor, setReadyFor] = useState<SavedCanvasScene | undefined | null>(
    null,
  );
  const autosaveRef = useRef<AutosaveHandle | null>(null);

  useEffect(() => {
    let cancelled = false;
    let autosave: AutosaveHandle | null = null;
    const document = savedScene ? Promise.resolve(savedScene) : loadScene();

    function startSaving() {
      autosave = savedScene
        ? startAutosave(
            scene,
            () => viewportRef.current,
            async (elements, viewport) => {
              const data = await buildSavedSceneData(elements, viewport);
              if (savedScene.saveData) await savedScene.saveData(data);
              else await updateSceneData(savedScene.id, data);
            },
          )
        : startAutosave(scene, () => viewportRef.current);
      autosaveRef.current = autosave;
      setReadyFor(savedScene);
    }

    void document
      .then((saved) => {
        if (cancelled) return;
        if (saved) {
          scene.replaceAll(saved.elements);
          selectionStore.clear();
          scene.markClean();
          const restored = saved.viewport;
          if (
            Number.isFinite(restored.scrollX) &&
            Number.isFinite(restored.scrollY) &&
            Number.isFinite(restored.zoom) &&
            restored.zoom > 0
          ) {
            viewportRef.current = {
              ...restored,
              zoom: clampZoom(restored.zoom),
            };
            setCurrentViewport(viewportRef.current);
          }
        }
        startSaving();
      })
      .catch((error: unknown) => {
        console.error("Could not restore the drawing", error);
        if (!cancelled) startSaving();
      });

    return () => {
      cancelled = true;
      autosave?.stop();
      autosaveRef.current = null;
    };
  }, [savedScene, viewportRef]);

  return { persistenceReady: readyFor === savedScene, autosaveRef };
}
