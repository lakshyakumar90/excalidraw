import type { ArrowBinding, ArrowElement, Element, Point } from "@repo/common";
import { getBoundsCenter } from "./bounds";
import { getElementLocalBounds } from "./elementLocalBounds";
import { rotatePoint } from "./rotation";
import { getArrowMidpoint } from "./arrow";
function getLinearPointLocalPosition(
  element: ArrowElement,
  point: Point,
): Point {
  const c = getBoundsCenter(getElementLocalBounds(element));
  const local = rotatePoint(point, -(element.angle ?? 0), {
    x: element.x + c.x,
    y: element.y + c.y,
  });
  return { x: local.x - element.x, y: local.y - element.y };
}
type ConnectableShape = Extract<
  Element,
  { type: "rectangle" | "ellipse" | "diamond" }
>;

export function isConnectableShape(
  element: Element,
): element is ConnectableShape {
  return (
    element.type === "rectangle" ||
    element.type === "ellipse" ||
    element.type === "diamond"
  );
}

function getShapeCenter(shape: ConnectableShape): Point {
  return {
    x: (shape.width ?? 0) / 2,
    y: (shape.height ?? 0) / 2,
  };
}

function getWorldShapeCenter(shape: ConnectableShape): Point {
  const center = getShapeCenter(shape);
  return { x: shape.x + center.x, y: shape.y + center.y };
}

function toShapeLocalPoint(shape: ConnectableShape, point: Point): Point {
  const center = getWorldShapeCenter(shape);
  const unrotated = rotatePoint(point, -(shape.angle ?? 0), center);
  return { x: unrotated.x - shape.x, y: unrotated.y - shape.y };
}

function normalize(vector: Point): Point {
  const length = Math.hypot(vector.x, vector.y);
  if (length < 1e-9) return { x: 1, y: 0 };
  return { x: vector.x / length, y: vector.y / length };
}

export function getBindingFocus(
  shape: ConnectableShape,
  endpoint: Point,
  oppositeEndpoint: Point,
): Point {
  const center = getShapeCenter(shape);
  const localEndpoint = toShapeLocalPoint(shape, endpoint);
  let direction = {
    x: localEndpoint.x - center.x,
    y: localEndpoint.y - center.y,
  };

  if (Math.hypot(direction.x, direction.y) < 1) {
    const localOpposite = toShapeLocalPoint(shape, oppositeEndpoint);
    direction = {
      x: localOpposite.x - center.x,
      y: localOpposite.y - center.y,
    };
  }

  return normalize(direction);
}

export function getBoundaryLocalPoint(
  shape: ConnectableShape,
  direction: Point,
): Point {
  const width = Math.max(1, shape.width ?? 0);
  const height = Math.max(1, shape.height ?? 0);
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const focus = normalize(direction);
  let scale: number;

  if (shape.type === "ellipse") {
    scale =
      1 / Math.sqrt((focus.x / halfWidth) ** 2 + (focus.y / halfHeight) ** 2);
  } else if (shape.type === "diamond") {
    scale =
      1 / (Math.abs(focus.x) / halfWidth + Math.abs(focus.y) / halfHeight);
  } else {
    const horizontalScale =
      Math.abs(focus.x) > 0 ? halfWidth / Math.abs(focus.x) : Infinity;
    const verticalScale =
      Math.abs(focus.y) > 0 ? halfHeight / Math.abs(focus.y) : Infinity;
    scale = Math.min(horizontalScale, verticalScale);
  }

  const center = getShapeCenter(shape);
  return {
    x: center.x + focus.x * scale,
    y: center.y + focus.y * scale,
  };
}

export function getArrowBindingPoint(
  shape: ConnectableShape,
  binding: ArrowBinding,
): Point {
  const width = shape.width ?? 0;
  const height = shape.height ?? 0;
  const localPoint = binding.fixedPoint
    ? {
        x: binding.fixedPoint[0] * width,
        y: binding.fixedPoint[1] * height,
      }
    : getBoundaryLocalPoint(shape, { x: binding.focus, y: 1 });
  const center = getShapeCenter(shape);
  const outward = normalize({
    x: localPoint.x - center.x,
    y: localPoint.y - center.y,
  });
  localPoint.x += outward.x * (binding.gap ?? 4);
  localPoint.y += outward.y * (binding.gap ?? 4);
  const worldCenter = getWorldShapeCenter(shape);
  return rotatePoint(
    { x: shape.x + localPoint.x, y: shape.y + localPoint.y },
    shape.angle ?? 0,
    worldCenter,
  );
}

export function setArrowEndpoint(
  arrow: ArrowElement,
  pointIndex: number,
  worldPoint: Point,
): ArrowElement {
  const localPoint = getLinearPointLocalPosition(arrow, worldPoint);
  const points = arrow.points.map((point) => ({ ...point }));
  const currentPoint = points[pointIndex];
  if (!currentPoint) return arrow;
  points[pointIndex] = { ...currentPoint, ...localPoint };

  const oldCenter = getBoundsCenter(getElementLocalBounds(arrow));
  const newCenter = getBoundsCenter(
    getElementLocalBounds({ ...arrow, points }),
  );
  const dx = oldCenter.x - newCenter.x;
  const dy = oldCenter.y - newCenter.y;
  const angle = arrow.angle ?? 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return {
    ...arrow,
    points,
    x: arrow.x + dx - (dx * cos - dy * sin),
    y: arrow.y + dy - (dx * sin + dy * cos),
  };
}

/** A version-neutral projection: remote target edits never create durable arrow edits. */
export function projectBindings(
  elements: readonly Element[],
  suppressed: ReadonlySet<string> = new Set(),
): readonly Element[] {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const arrows = elements.map((element) => {
    if (
      element.type !== "arrow" ||
      element.isDeleted ||
      suppressed.has(element.id)
    )
      return element;
    let arrow = element;
    for (const key of ["startBinding", "endBinding"] as const) {
      const binding = arrow[key];
      if (!binding) continue;
      const shape = byId.get(binding.elementId);
      if (!shape || shape.isDeleted || !isConnectableShape(shape)) continue;
      const next = setArrowEndpoint(
        arrow,
        key === "startBinding" ? 0 : arrow.points.length - 1,
        getArrowBindingPoint(shape, binding),
      );
      if (
        next.x !== arrow.x ||
        next.y !== arrow.y ||
        next.points.some(
          (p, i) => p.x !== arrow.points[i]?.x || p.y !== arrow.points[i]?.y,
        )
      )
        arrow = next;
    }
    return arrow;
  });
  const owners = new Map(arrows.map((e) => [e.id, e]));
  return arrows.map((element) => {
    if (
      element.type !== "text" ||
      !element.containerId ||
      element.isDeleted ||
      suppressed.has(element.id)
    )
      return element;
    const owner = owners.get(element.containerId);
    if (!owner || owner.isDeleted) return element;
    if (owner.type === "arrow") {
      const midpoint = getArrowMidpoint(owner);
      return {
        ...element,
        x: midpoint.x - (element.width ?? 0) / 2,
        y: midpoint.y - (element.height ?? 0) / 2,
        frameId: owner.frameId ?? null,
      };
    }
    if (owner.type === "rectangle")
      return {
        ...element,
        x: owner.x,
        y: owner.y,
        width: owner.width,
        height: owner.height,
        angle: owner.angle,
        frameId: owner.frameId ?? null,
      };
    return element;
  });
}

/** Screen-relative radial boundary distance with deterministic distance/paint-order ties. */
export function findBindingShape(
  elements: readonly Element[],
  point: Point,
  zoom = 1,
): ConnectableShape | undefined {
  let best: ConnectableShape | undefined,
    bestDistance = Infinity;
  const frames = new Map(
    elements
      .filter((e) => e.type === "frame" && !e.isDeleted)
      .map((e) => [e.id, e]),
  );
  for (const e of elements) {
    if (e.isDeleted || !isConnectableShape(e)) continue;
    const f = frames.get(e.frameId ?? "");
    if (
      f &&
      (point.x < f.x ||
        point.x > f.x + (f.width ?? 0) ||
        point.y < f.y ||
        point.y > f.y + (f.height ?? 0))
    )
      continue;
    const local = toShapeLocalPoint(e, point),
      center = getShapeCenter(e),
      direction = { x: local.x - center.x, y: local.y - center.y };
    const boundary = getBoundaryLocalPoint(e, direction);
    const distance = Math.max(
      0,
      Math.hypot(direction.x, direction.y) -
        Math.hypot(boundary.x - center.x, boundary.y - center.y),
    );
    if (distance <= 12 / Math.max(0.01, zoom) && distance <= bestDistance) {
      best = e;
      bestDistance = distance;
    }
  }
  return best;
}
