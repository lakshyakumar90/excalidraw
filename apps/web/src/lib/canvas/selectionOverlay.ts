import type { Element, Viewport } from "@repo/common";
import { getElementCorners } from "@repo/engine";
import type { MarqueePreview } from "@/lib/selection/selectionController";
import {
  getLinearEndpointHandles,
  getLinearBendHandlePoint,
  getLinearPointWorldPosition,
  getLinearPathWorldPoints,
  getResizeHandles,
} from "@/lib/selection/handles";

function getPathBoundary(points: readonly { x: number; y: number }[], padding: number) {
  if (points.length < 2) return [];

  const offsetSide = (direction: 1 | -1) =>
    points.map((point, index) => {
      const previous = points[Math.max(0, index - 1)] ?? point;
      const next = points[Math.min(points.length - 1, index + 1)] ?? point;
      const dx = next.x - previous.x;
      const dy = next.y - previous.y;
      const length = Math.hypot(dx, dy) || 1;
      const normalX = (-dy / length) * padding * direction;
      const normalY = (dx / length) * padding * direction;
      return { x: point.x + normalX, y: point.y + normalY };
    });

  return [...offsetSide(1), ...offsetSide(-1).reverse()];
}

function drawElementSelectionOutline(
  context: CanvasRenderingContext2D,
  element: Element,
  zoom: number,
): void {
  if (element.type === "line" || element.type === "arrow") {
    const boundary = getPathBoundary(getLinearPathWorldPoints(element), 4 / zoom);
    const first = boundary[0];
    if (!first) return;
    context.beginPath();
    context.moveTo(first.x, first.y);
    for (let index = 1; index < boundary.length; index += 1) {
      const point = boundary[index];
      if (point) context.lineTo(point.x, point.y);
    }
    context.closePath();
    context.stroke();
    return;
  }

  const corners = expandCorners(getElementCorners(element), 4 / zoom);
  const first = corners[0];
  if (!first) return;
  context.beginPath();
  context.moveTo(first.x, first.y);
  for (let index = 1; index < corners.length; index += 1) {
    const point = corners[index];
    if (point) context.lineTo(point.x, point.y);
  }
  context.closePath();
  context.stroke();
}

function expandCorners(
  corners: ReturnType<typeof getElementCorners>,
  padding: number,
): ReturnType<typeof getElementCorners> {
  if (corners.length !== 4) return corners;

  const topLeft = corners[0];
  const topRight = corners[1];
  const bottomLeft = corners[3];

  if (!topLeft || !topRight || !bottomLeft) return corners;

  function unitVector(vector: { x: number; y: number }) {
    const length = Math.hypot(vector.x, vector.y);

    if (length === 0) return null;

    return {
      x: vector.x / length,
      y: vector.y / length,
    };
  }

  const xAxis = unitVector({
    x: topRight.x - topLeft.x,
    y: topRight.y - topLeft.y,
  });

  const yAxis = unitVector({
    x: bottomLeft.x - topLeft.x,
    y: bottomLeft.y - topLeft.y,
  });

  // A line element can have zero height or width. Use a perpendicular axis
  // in that case so the selection outline still gets visible padding.
  const horizontal =
    xAxis ?? (yAxis ? { x: yAxis.y, y: -yAxis.x } : { x: 1, y: 0 });
  const vertical = yAxis ?? { x: -horizontal.y, y: horizontal.x };

  const signs = [
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
  ];

  return corners.map((corner, index) => {
    const sign = signs[index];

    if (!sign) return corner;

    return {
      x: corner.x + (horizontal.x * sign.x + vertical.x * sign.y) * padding,
      y: corner.y + (horizontal.y * sign.x + vertical.y * sign.y) * padding,
    };
  });
}

export function drawSelectionOverlay(
  context: CanvasRenderingContext2D,
  viewport: Viewport,
  selectedElements: readonly Element[] | undefined,
  marquee: MarqueePreview | null,
  pointEditingElement: Element | null = null,
  isCompleteGroupSelection = false,
  sceneElements: readonly Element[] = [],
): void {
  context.save();

  // Draw in scene coordinates, just like the canvas elements.
  context.translate(viewport.scrollX, viewport.scrollY);
  context.scale(viewport.zoom, viewport.zoom);

  context.lineWidth = 1 / viewport.zoom;
  context.strokeStyle = "#4c7dff";
  context.setLineDash([5 / viewport.zoom, 4 / viewport.zoom]);

  // Draw an outline around each selected element's rotated corners.
  const activeElements = (selectedElements ?? []).filter(
    (element) => !element.isDeleted,
  );

  const drawConnectionPoint = (point: { x: number; y: number }) => {
    context.beginPath();
    context.arc(point.x, point.y, 3.5 / viewport.zoom, 0, Math.PI * 2);
    context.fillStyle = "#4c7dff";
    context.fill();
    context.lineWidth = 1.5 / viewport.zoom;
    context.strokeStyle = "#ffffff";
    context.stroke();
  };

  for (const element of activeElements) {
    if (
      element.type === "rectangle" ||
      element.type === "ellipse" ||
      element.type === "diamond"
    ) {
      for (const boundId of element.boundElements ?? []) {
        const arrow = sceneElements.find(
          (candidate) => candidate.id === boundId && candidate.type === "arrow",
        );
        if (!arrow || arrow.type !== "arrow") continue;
        if (arrow.startBinding?.elementId === element.id && arrow.points[0]) {
          drawConnectionPoint(getLinearPointWorldPosition(arrow, arrow.points[0]));
        }
        const end = arrow.points[arrow.points.length - 1];
        if (arrow.endBinding?.elementId === element.id && end) {
          drawConnectionPoint(getLinearPointWorldPosition(arrow, end));
        }
      }
    }

    if (element.type === "arrow") {
      if (element.startBinding && element.points[0]) {
        drawConnectionPoint(
          getLinearPointWorldPosition(element, element.points[0]),
        );
      }
      const end = element.points[element.points.length - 1];
      if (element.endBinding && end) {
        drawConnectionPoint(getLinearPointWorldPosition(element, end));
      }
    }
  }
  // Endpoint markers use a white outline for contrast. Restore the selection
  // style before drawing element outlines and the shared multi-selection box.
  context.lineWidth = 1 / viewport.zoom;
  context.strokeStyle = "#4c7dff";
  if (activeElements.length > 1) {
    const corners = activeElements.flatMap(getElementCorners);
    const xs = corners.map((p) => p.x),
      ys = corners.map((p) => p.y);
    const minX = Math.min(...xs),
      minY = Math.min(...ys),
      maxX = Math.max(...xs),
      maxY = Math.max(...ys);

    // Independent multi-selection shows each element boundary as well as the
    // shared transform box. A complete group keeps only its outer boundary.
    if (!isCompleteGroupSelection) {
      context.setLineDash([]);
      for (const element of activeElements) {
        drawElementSelectionOutline(context, element, viewport.zoom);
      }
      context.setLineDash([5 / viewport.zoom, 4 / viewport.zoom]);
    }

    context.strokeRect(
      minX - 4 / viewport.zoom,
      minY - 4 / viewport.zoom,
      maxX - minX + 8 / viewport.zoom,
      maxY - minY + 8 / viewport.zoom,
    );
    const size = 8 / viewport.zoom;
    context.setLineDash([]);
    context.fillStyle = "#fff";
    context.strokeStyle = "#4c7dff";
    for (const p of [
      { x: minX, y: minY },
      { x: (minX + maxX) / 2, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: (minY + maxY) / 2 },
      { x: maxX, y: maxY },
      { x: (minX + maxX) / 2, y: maxY },
      { x: minX, y: maxY },
      { x: minX, y: (minY + maxY) / 2 },
    ]) {
      context.fillRect(p.x - size / 2, p.y - size / 2, size, size);
      context.strokeRect(p.x - size / 2, p.y - size / 2, size, size);
    }
  }

  for (const element of activeElements.length > 1 ? [] : activeElements) {
    if (element.isDeleted) continue;
    context.setLineDash([]);
    drawElementSelectionOutline(context, element, viewport.zoom);
  }

  // Show rotated handles for one element; multi-selection uses the shared box above.
  if (activeElements.length === 1) {
    const element = activeElements[0];

    if (element) {
      const handleSize = 8 / viewport.zoom;
      context.setLineDash([]);
      context.lineWidth = 1 / viewport.zoom;
      context.fillStyle = "#ffffff";
      context.strokeStyle = "#4c7dff";
      const handles =
        element.type === "line" || element.type === "arrow"
          ? getLinearEndpointHandles(element)
          : getResizeHandles(element, viewport.zoom);

      for (const { point } of handles) {
        context.fillRect(
          point.x - handleSize / 2,
          point.y - handleSize / 2,
          handleSize,
          handleSize,
        );
        context.strokeRect(
          point.x - handleSize / 2,
          point.y - handleSize / 2,
          handleSize,
          handleSize,
        );
      }

      if (element.type === "line" || element.type === "arrow") {
        const bendHandle = getLinearBendHandlePoint(element);
        if (bendHandle) {
          context.beginPath();
          context.arc(bendHandle.x, bendHandle.y, handleSize / 2, 0, Math.PI * 2);
          context.fill();
          context.stroke();
        }
      }
    }
  }

  if (pointEditingElement && "points" in pointEditingElement) {
    context.setLineDash([]);
    context.fillStyle = "#ffffff";
    context.strokeStyle = "#4c7dff";
    for (const p of pointEditingElement.points) {
      const worldPoint =
        pointEditingElement.type === "line" ||
        pointEditingElement.type === "arrow"
          ? getLinearPointWorldPosition(pointEditingElement, p)
          : { x: pointEditingElement.x + p.x, y: pointEditingElement.y + p.y };
      const { x, y } = worldPoint;
      const size = 8 / viewport.zoom;
      context.beginPath();
      context.arc(x, y, size / 2, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }
  }

  // Show a temporary rectangle while dragging on empty canvas.
  if (marquee) {
    const x = Math.min(marquee.start.x, marquee.current.x);
    const y = Math.min(marquee.start.y, marquee.current.y);
    const width = Math.abs(marquee.current.x - marquee.start.x);
    const height = Math.abs(marquee.current.y - marquee.start.y);

    context.fillStyle = "rgba(76, 125, 255, 0.10)";
    context.fillRect(x, y, width, height);

    context.strokeStyle = "#4c7dff";
    context.setLineDash([5 / viewport.zoom, 4 / viewport.zoom]);
    context.strokeRect(x, y, width, height);
  }

  context.restore();
}
