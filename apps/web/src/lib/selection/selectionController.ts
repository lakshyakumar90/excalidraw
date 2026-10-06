import type { Point } from "@repo/common";
import { getElementAtPosition } from "@repo/engine";
import { scene } from "@/lib/scene/scene";
import { selectionStore } from "./selectionStore";

export interface MarqueePreview {
  start: Point;
  current: Point;
}

let marquee: MarqueePreview | null = null;

export const selectionController = {
  selectAt(point: Point, shiftKey: boolean, zoom: number) {
    // A new pointer down ends any previous marquee.
    marquee = null;

    const hit = getElementAtPosition(scene.getElements(), point, zoom);

    if (!hit) {
      selectionStore.clear();
      return null;
    }

    if (shiftKey) {
      selectionStore.toggle(hit.id);
    } else {
      selectionStore.set([hit.id]);
    }

    return hit;
  },

  beginMarquee(point: Point): void {
    marquee = {
      start: point,
      current: point,
    };
  },

  updateMarquee(point: Point): void {
    if (!marquee) return;

    marquee = {
      ...marquee,
      current: point,
    };
  },

  getMarquee(): MarqueePreview | null {
    return marquee;
  },

  endMarquee(): void {
    marquee = null;
  },
};
