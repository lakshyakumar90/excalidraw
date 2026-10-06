import type { Viewport } from "@repo/common";
import type { Scene } from "@repo/engine";
import { saveScene } from "./indexedDb";

const SAVE_DELAY_MS = 300;

export function startAutosave(
  scene: Scene,
  getViewport: () => Viewport,
): () => void {
  let timer: number | null = null;
  let dirty = false;
  let saving = false;
  let saveAgain = false;

  const persist = async () => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    if (saving) {
      saveAgain = true;
      return;
    }
    if (!dirty) return;

    saving = true;
    do {
      dirty = false;
      saveAgain = false;
      try {
        await saveScene(scene.getElements(), getViewport());
      } catch (error) {
        dirty = true;
        console.error("Could not save the local drawing", error);
        break;
      }
    } while (saveAgain || dirty);
    saving = false;
  };

  const schedule = () => {
    dirty = true;
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => void persist(), SAVE_DELAY_MS);
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") void persist();
  };
  const onBeforeUnload = () => void persist();

  const unsubscribe = scene.subscribe(schedule);
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("beforeunload", onBeforeUnload);

  return () => {
    unsubscribe();
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("beforeunload", onBeforeUnload);
    if (timer !== null) window.clearTimeout(timer);
    void persist();
  };
}
