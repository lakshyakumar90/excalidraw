import type { Element, FrameElement, Viewport } from "@repo/common";

export interface SlideDescriptor {
  id: string;
  title: string;
  slideOrder: number;
  x: number;
  y: number;
  width: number;
  height: number;
  frame: FrameElement;
}

/**
 * Extracts active `frame` elements sorted deterministically by `slideOrder`,
 * falling back to top-to-bottom / left-to-right spatial order.
 */
export function extractOrderedSlides(
  elements: readonly Element[],
): SlideDescriptor[] {
  const frames = elements.filter(
    (el): el is FrameElement => el.type === "frame" && !el.isDeleted,
  );
  const sorted = [...frames].sort((a, b) => {
    const orderA =
      typeof a.slideOrder === "number" && Number.isFinite(a.slideOrder)
        ? a.slideOrder
        : Number.MAX_SAFE_INTEGER;
    const orderB =
      typeof b.slideOrder === "number" && Number.isFinite(b.slideOrder)
        ? b.slideOrder
        : Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    if (Math.abs(a.y - b.y) > 40) return a.y - b.y;
    return a.x - b.x;
  });

  return sorted.map((frame, index) => ({
    id: frame.id,
    title: frame.title?.trim() || frame.name?.trim() || `Slide ${index + 1}`,
    slideOrder:
      typeof frame.slideOrder === "number" && Number.isFinite(frame.slideOrder)
        ? frame.slideOrder
        : index,
    x: frame.x,
    y: frame.y,
    width: Math.max(1, Math.abs(frame.width ?? 1280)),
    height: Math.max(1, Math.abs(frame.height ?? 720)),
    frame,
  }));
}

/**
 * Updates `slideOrder` on frame elements according to the new ID ordering,
 * bumping `version` and `versionNonce` so changes sync via normal `applyCommit`.
 */
export function reorderSlides(
  elements: readonly Element[],
  orderedFrameIds: readonly string[],
): FrameElement[] {
  const orderIndex = new Map<string, number>();
  orderedFrameIds.forEach((id, idx) => orderIndex.set(id, idx));
  const updated: FrameElement[] = [];

  for (const el of elements) {
    if (el.type !== "frame" || el.isDeleted) continue;
    const nextOrder = orderIndex.get(el.id);
    if (nextOrder === undefined || el.slideOrder === nextOrder) continue;
    updated.push({
      ...el,
      slideOrder: nextOrder,
      version: (el.version ?? 1) + 1,
      versionNonce: ((el.versionNonce ?? 1) * 1664525 + 1013904223) >>> 0,
    });
  }

  return updated;
}

/**
 * Computes the target camera viewport (`scrollX`, `scrollY`, `zoom`) that
 * frames a slide centered in the presentation screen with comfortable padding.
 */
export function computeSlideViewport(
  slide: Pick<SlideDescriptor, "x" | "y" | "width" | "height">,
  viewportWidth: number,
  viewportHeight: number,
  padding = 48,
): Viewport {
  const usableW = Math.max(64, viewportWidth - padding * 2);
  const usableH = Math.max(64, viewportHeight - padding * 2);
  const rawZoom = Math.min(usableW / slide.width, usableH / slide.height);
  const zoom = Math.max(0.1, Math.min(4, rawZoom));
  const centerX = slide.x + slide.width / 2;
  const centerY = slide.y + slide.height / 2;
  return {
    zoom,
    scrollX: viewportWidth / 2 - centerX * zoom,
    scrollY: viewportHeight / 2 - centerY * zoom,
  };
}

/** Smooth cubic-bezier ease-in-out curve for presentation camera transitions. */
export function cubicBezierEaseInOut(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
}

/**
 * Smoothly animates camera pan/zoom from `from` to `to` using
 * `requestAnimationFrame` and cubic-bezier easing. Returns a cancel function.
 */
export function animateViewportTransition(
  from: Viewport,
  to: Viewport,
  durationMs: number,
  onStep: (viewport: Viewport) => void,
  onDone?: () => void,
): () => void {
  if (typeof requestAnimationFrame === "undefined" || durationMs <= 0) {
    onStep(to);
    onDone?.();
    return () => undefined;
  }

  let rafId = 0;
  let cancelled = false;
  const start = performance.now();

  const tick = (now: number) => {
    if (cancelled) return;
    const progress = Math.min(1, (now - start) / durationMs);
    const eased = cubicBezierEaseInOut(progress);
    onStep({
      scrollX: from.scrollX + (to.scrollX - from.scrollX) * eased,
      scrollY: from.scrollY + (to.scrollY - from.scrollY) * eased,
      zoom: from.zoom + (to.zoom - from.zoom) * eased,
    });
    if (progress < 1) {
      rafId = requestAnimationFrame(tick);
    } else {
      onDone?.();
    }
  };

  rafId = requestAnimationFrame(tick);
  return () => {
    cancelled = true;
    cancelAnimationFrame(rafId);
  };
}
