"use client";

import { useSyncExternalStore } from "react";
import type { Scene } from "@repo/engine";

export function useScene(scene: Scene): number {
  return useSyncExternalStore(
    (cb) => scene.subscribe(cb),
    () => scene.getSnapshot(),
    () => scene.getSnapshot()
  );
}
