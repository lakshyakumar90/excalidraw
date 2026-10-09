import type { Element, Point } from "@repo/common";
import { getElementAxisAlignedBounds } from "../geometry/elementBounds";

export type LayoutAction =
  | "left"
  | "center"
  | "right"
  | "top"
  | "middle"
  | "bottom"
  | "horizontal"
  | "vertical";
export interface Guide {
  axis: "x" | "y";
  position: number;
}

export function selectionClosure(
  elements: readonly Element[],
  ids: Iterable<string>,
): Element[] {
  const selected = new Set(ids);
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of elements) {
      if (e.isDeleted || selected.has(e.id)) continue;
      if (
        (e.frameId && selected.has(e.frameId)) ||
        (e.type === "text" && e.containerId && selected.has(e.containerId))
      ) {
        selected.add(e.id);
        changed = true;
      }
    }
  }
  return elements.filter((e) => !e.isDeleted && selected.has(e.id));
}

export function visibleBounds(
  element: Element,
  elements: readonly Element[],
  frames?: ReadonlyMap<string, Element>,
) {
  const b = getElementAxisAlignedBounds(element);
  const frame = frames
    ? frames.get(element.frameId ?? "")
    : elements.find(
        (e) => e.id === element.frameId && e.type === "frame" && !e.isDeleted,
      );
  if (!frame) return b;
  const f = getElementAxisAlignedBounds(frame);
  const clipped = {
    minX: Math.max(b.minX, f.minX),
    minY: Math.max(b.minY, f.minY),
    maxX: Math.min(b.maxX, f.maxX),
    maxY: Math.min(b.maxY, f.maxY),
  };
  return clipped.minX > clipped.maxX || clipped.minY > clipped.maxY
    ? null
    : clipped;
}

/** Flat frames use center containment; later paint order wins overlapping frames. */
export function frameForElement(
  element: Element,
  elements: readonly Element[],
): string | null {
  if (element.type === "frame") return null;
  const b = getElementAxisAlignedBounds(element);
  const x = (b.minX + b.maxX) / 2,
    y = (b.minY + b.maxY) / 2;
  return (
    [...elements]
      .reverse()
      .find(
        (e) =>
          e.type === "frame" &&
          !e.isDeleted &&
          x >= e.x &&
          x <= e.x + (e.width ?? 0) &&
          y >= e.y &&
          y <= e.y + (e.height ?? 0),
      )?.id ?? null
  );
}

export function layoutDeltas(
  elements: readonly Element[],
  action: LayoutAction,
): Map<string, Point> {
  const result = new Map<string, Point>();
  const units = new Map<string, Element[]>();
  const selected = new Set(elements.map((e) => e.id));
  for (const e of elements) {
    if (
      e.isDeleted ||
      (e.frameId && selected.has(e.frameId)) ||
      (e.type === "text" && e.containerId && selected.has(e.containerId))
    )
      continue;
    const key = e.groupIds?.at(-1) ?? e.id;
    units.set(key, [...(units.get(key) ?? []), e]);
  }
  const items = [...units.entries()].map(([id, members]) => {
    const bs = members.map(getElementAxisAlignedBounds);
    return {
      id,
      members,
      minX: Math.min(...bs.map((b) => b.minX)),
      minY: Math.min(...bs.map((b) => b.minY)),
      maxX: Math.max(...bs.map((b) => b.maxX)),
      maxY: Math.max(...bs.map((b) => b.maxY)),
    };
  });
  const distribute = action === "horizontal" || action === "vertical";
  if (items.length < (distribute ? 3 : 2)) return result;
  const horizontal = ["left", "center", "right", "horizontal"].includes(action);
  const low = horizontal ? "minX" : "minY",
    high = horizontal ? "maxX" : "maxY";
  const min = Math.min(...items.map((i) => i[low])),
    max = Math.max(...items.map((i) => i[high]));
  items.sort((a, b) => a[low] - b[low] || a.id.localeCompare(b.id));
  const gap =
    (max - min - items.reduce((sum, i) => sum + i[high] - i[low], 0)) /
    (items.length - 1);
  let cursor = min;
  items.forEach((i, index) => {
    const delta = distribute
      ? index === 0 || index === items.length - 1
        ? 0
        : cursor - i[low]
      : action === "left" || action === "top"
        ? min - i[low]
        : action === "right" || action === "bottom"
          ? max - i[high]
          : (min + max - i[low] - i[high]) / 2;
    for (const e of i.members)
      if (Math.abs(delta) > 1e-8)
        result.set(e.id, horizontal ? { x: delta, y: 0 } : { x: 0, y: delta });
    cursor += i[high] - i[low] + gap;
  });
  return result;
}

/** Build once at gesture start; sorted axis anchors avoid scanning every element per move. */
export class SnapIndex {
  private x: number[];
  private y: number[];
  private locks: Partial<
    Record<"x" | "y", { position: number; anchor: number }>
  > = {};
  reset() {
    this.locks = {};
  }
  constructor(elements: readonly Element[], excluded: Set<string>) {
    const frames = new Map(
      elements
        .filter((e) => e.type === "frame" && !e.isDeleted)
        .map((e) => [e.id, e]),
    );
    const bounds = elements
      .filter((e) => !e.isDeleted && !excluded.has(e.id))
      .map((e) => visibleBounds(e, elements, frames))
      .filter((b) => b !== null);
    this.x = bounds
      .flatMap((b) => [b.minX, (b.minX + b.maxX) / 2, b.maxX])
      .sort((a, b) => a - b);
    this.y = bounds
      .flatMap((b) => [b.minY, (b.minY + b.maxY) / 2, b.maxY])
      .sort((a, b) => a - b);
  }
  snap(
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    zoom: number,
  ): { delta: Point; guides: Guide[] } {
    const guides: Guide[] = [],
      delta = { x: 0, y: 0 };
    for (const axis of ["x", "y"] as const) {
      const values = axis === "x" ? this.x : this.y;
      const lo = axis === "x" ? bounds.minX : bounds.minY,
        hi = axis === "x" ? bounds.maxX : bounds.maxY;
      const anchors = [lo, (lo + hi) / 2, hi];
      const locked = this.locks[axis];
      if (
        locked &&
        Math.abs(locked.position - anchors[locked.anchor]!) <=
          9 / Math.max(0.01, zoom)
      ) {
        delta[axis] = locked.position - anchors[locked.anchor]!;
        guides.push({ axis, position: locked.position });
        continue;
      }
      delete this.locks[axis];
      let winningAnchor = 0;
      let best = 6 / Math.max(0.01, zoom) + 1e-9,
        position = 0;
      for (const [anchorIndex, anchor] of anchors.entries()) {
        let l = 0,
          r = values.length;
        while (l < r) {
          const m = (l + r) >>> 1;
          if (values[m]! < anchor) l = m + 1;
          else r = m;
        }
        for (const i of [l - 1, l]) {
          const target = values[i];
          if (target === undefined) continue;
          const d = target - anchor;
          if (Math.abs(d) < best) {
            best = Math.abs(d);
            delta[axis] = d;
            position = target;
            winningAnchor = anchorIndex;
          }
        }
      }
      if (best <= 6 / Math.max(0.01, zoom)) {
        guides.push({ axis, position });
        this.locks[axis] = { position, anchor: winningAnchor };
      }
    }
    return { delta, guides };
  }
}

export function framePaintOrder(elements: readonly Element[]): Element[] {
  const frames = new Set(
    elements.filter((e) => e.type === "frame" && !e.isDeleted).map((e) => e.id),
  );
  const children = new Map<string, Element[]>();
  for (const e of elements)
    if (e.type !== "frame" && e.frameId && frames.has(e.frameId)) {
      const list = children.get(e.frameId) ?? [];
      list.push(e);
      children.set(e.frameId, list);
    }
  const result: Element[] = [];
  for (const e of elements) {
    if (e.type !== "frame" && e.frameId && frames.has(e.frameId)) continue;
    result.push(e);
    if (e.type === "frame") result.push(...(children.get(e.id) ?? []));
  }
  return result;
}
