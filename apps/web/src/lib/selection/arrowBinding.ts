import type {
  ArrowBinding,
  ArrowElement,
  Element,
  Point,
} from "@repo/common";
import {
  getBoundsCenter,
  getElementLocalBounds,
  isPointOnElement,
  rotatePoint,
} from "@repo/engine";
import { scene } from "@/lib/scene/scene";
import {
  getLinearPointLocalPosition,
  getLinearPointWorldPosition,
} from "./handles";

type ConnectableShape = Extract<
  Element,
  { type: "rectangle" | "ellipse" | "diamond" }
>;

function isConnectableShape(element: Element): element is ConnectableShape {
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
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
}

function getBindingFocus(
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

function getBoundaryLocalPoint(
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
      1 /
      Math.sqrt(
        (focus.x / halfWidth) ** 2 + (focus.y / halfHeight) ** 2,
      );
  } else if (shape.type === "diamond") {
    scale =
      1 /
      (Math.abs(focus.x) / halfWidth + Math.abs(focus.y) / halfHeight);
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
  const worldCenter = getWorldShapeCenter(shape);
  return rotatePoint(
    { x: shape.x + localPoint.x, y: shape.y + localPoint.y },
    shape.angle ?? 0,
    worldCenter,
  );
}

function setArrowEndpoint(
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

function findShapeAt(point: Point): ConnectableShape | undefined {
  const elements = scene.getElements();
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const element = elements[index];
    if (
      element &&
      !element.isDeleted &&
      isConnectableShape(element) &&
      isPointOnElement(element, point, 1)
    ) {
      return element;
    }
  }
  return undefined;
}

function addArrowToShape(shape: ConnectableShape, arrowId: string): void {
  if (shape.boundElements?.includes(arrowId)) return;
  scene.mutateElement(shape.id, {
    boundElements: [...(shape.boundElements ?? []), arrowId],
  });
}

/** Bind arrow endpoints that were drawn on top of connectable shapes. */
export function bindArrowToScene(arrow: ArrowElement): ArrowElement {
  let nextArrow = { ...arrow, points: arrow.points.map((point) => ({ ...point })) };
  const endpointCount = nextArrow.points.length;
  const endpoints = [
    { index: 0, bindingKey: "startBinding" as const },
    { index: endpointCount - 1, bindingKey: "endBinding" as const },
  ];

  for (const { index, bindingKey } of endpoints) {
    const localEndpoint = nextArrow.points[index];
    const oppositeIndex = index === 0 ? endpointCount - 1 : 0;
    const localOpposite = nextArrow.points[oppositeIndex];
    if (!localEndpoint || !localOpposite) continue;

    const endpoint = getLinearPointWorldPosition(nextArrow, localEndpoint);
    const oppositeEndpoint = getLinearPointWorldPosition(
      nextArrow,
      localOpposite,
    );
    const shape = findShapeAt(endpoint);
    if (!shape) continue;

    const boundaryPoint = getBoundaryLocalPoint(
      shape,
      getBindingFocus(shape, endpoint, oppositeEndpoint),
    );
    const width = shape.width ?? 0;
    const height = shape.height ?? 0;
    const binding: ArrowBinding = {
      elementId: shape.id,
      focus: 0,
      gap: 0,
      fixedPoint: [
        width === 0 ? 0.5 : boundaryPoint.x / width,
        height === 0 ? 0.5 : boundaryPoint.y / height,
      ],
    };
    nextArrow = {
      ...nextArrow,
      [bindingKey]: binding,
    };
    nextArrow = setArrowEndpoint(
      nextArrow,
      index,
      getArrowBindingPoint(shape, binding),
    );
    addArrowToShape(shape, nextArrow.id);
  }

  return nextArrow;
}

/** Keep every arrow linked to a moved or resized shape on its outline. */
export function syncBoundArrowsForShape(shape: Element): void {
  if (!isConnectableShape(shape)) return;

  const arrowIds = new Set([
    ...(shape.boundElements ?? []),
    ...scene
      .getElements()
      .filter(
        (element) =>
          element.type === "arrow" &&
          (element.startBinding?.elementId === shape.id ||
            element.endBinding?.elementId === shape.id),
      )
      .map((element) => element.id),
  ]);

  for (const arrowId of arrowIds) {
    const arrow = scene.getElement(arrowId);
    if (
      !arrow ||
      arrow.type !== "arrow" ||
      arrow.isDeleted ||
      (arrow.startBinding?.elementId !== shape.id &&
        arrow.endBinding?.elementId !== shape.id)
    ) {
      continue;
    }

    let nextArrow = arrow;
    if (arrow.startBinding?.elementId === shape.id) {
      nextArrow = setArrowEndpoint(
        nextArrow,
        0,
        getArrowBindingPoint(shape, arrow.startBinding),
      );
    }
    if (arrow.endBinding?.elementId === shape.id) {
      nextArrow = setArrowEndpoint(
        nextArrow,
        nextArrow.points.length - 1,
        getArrowBindingPoint(shape, arrow.endBinding),
      );
    }

    if (nextArrow !== arrow) {
      scene.mutateElement(arrow.id, {
        x: nextArrow.x,
        y: nextArrow.y,
        points: nextArrow.points,
      });
    }
  }
}
