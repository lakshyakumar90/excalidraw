"use client";

import { useScene } from "@/lib/scene/useScene";
import { scene } from "@/lib/scene/scene";
import { createRectangleElement } from "@repo/engine";

export function SceneDebug() {
  const version = useScene(scene);

  const addRectangle = () => {
    const element = createRectangleElement({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });

    scene.addElement(element);
  };

  return (
    <div className="fixed right-3 top-3 z-50 rounded-lg border border-neutral-200 bg-white/90 px-3 py-2 font-mono text-xs text-neutral-700 shadow-sm backdrop-blur-sm">
      Scene version: {version}
      <div>Elements: {scene.size}</div>
      <div>Dirty: {scene.isDirty ? "yes" : "no"}</div>
      <button
        type="button"
        onClick={addRectangle}
        className="mt-2 rounded-md border border-neutral-300 bg-neutral-50 px-2 py-1 text-xs hover:bg-neutral-100"
      >
        Add rectangle
      </button>
    </div>
  );
}
