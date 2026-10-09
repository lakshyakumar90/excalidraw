import type { ArrowBinding, ArrowElement, Element, Point } from "@repo/common";
import {
  findBindingShape,
  isConnectableShape,
  getBindingFocus,
  getBoundaryLocalPoint,
  getArrowBindingPoint,
  setArrowEndpoint,
} from "@repo/engine";
import { scene } from "@/lib/scene/scene";
import { syncBoundTextToContainer } from "./boundElements";
import { getLinearPointWorldPosition } from "./handles";

type ConnectableShape = Extract<
  Element,
  { type: "rectangle" | "ellipse" | "diamond" }
>;

function findShapeAt(point: Point, zoom = 1) {
  return findBindingShape(scene.getElements(), point, zoom);
}
function addArrowToShape(shape: ConnectableShape, arrowId: string): void {
  if (shape.boundElements?.includes(arrowId)) return;
  scene.mutateElement(shape.id, {
    boundElements: [...(shape.boundElements ?? []), arrowId],
  });
}

/** Bind arrow endpoints that were drawn on top of connectable shapes. */
export function bindArrowToScene(arrow: ArrowElement, zoom = 1): ArrowElement {
  for (const shape of scene.getElements())
    if (shape.boundElements?.includes(arrow.id))
      scene.mutateElement(shape.id, {
        boundElements: shape.boundElements.filter((id) => id !== arrow.id),
      });
  let nextArrow = {
    ...arrow,
    points: arrow.points.map((point) => ({ ...point })),
  };
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
    const shape = findShapeAt(endpoint, zoom);
    if (!shape) {
      nextArrow = { ...nextArrow, [bindingKey]: null };
      continue;
    }

    const boundaryPoint = getBoundaryLocalPoint(
      shape,
      getBindingFocus(shape, endpoint, oppositeEndpoint),
    );
    const width = shape.width ?? 0;
    const height = shape.height ?? 0;
    const binding: ArrowBinding = {
      elementId: shape.id,
      focus: 0,
      gap: 4,
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
      syncBoundTextToContainer(nextArrow);
    }
  }
}
