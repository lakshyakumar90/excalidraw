import type { Element, Viewport } from "@repo/common";
import { getElementCorners } from "@repo/engine";
import type { MarqueePreview } from "@/lib/selection/selectionController";
import { getResizeHandles } from "@/lib/selection/handles";

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
): void {
  context.save();

  // Draw in scene coordinates, just like the canvas elements.
  context.translate(viewport.scrollX, viewport.scrollY);
  context.scale(viewport.zoom, viewport.zoom);

  context.lineWidth = 1 / viewport.zoom;
  context.strokeStyle = "#4c7dff";
  context.setLineDash([5 / viewport.zoom, 4 / viewport.zoom]);

  // Draw an outline around each selected element's rotated corners.
  const activeElements = (selectedElements ?? []).filter((element) => !element.isDeleted);
  if (activeElements.length > 1) {
    const corners = activeElements.flatMap(getElementCorners);
    const xs = corners.map((p) => p.x), ys = corners.map((p) => p.y);
    const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs), maxY = Math.max(...ys);
    context.strokeRect(minX - 4 / viewport.zoom, minY - 4 / viewport.zoom, maxX - minX + 8 / viewport.zoom, maxY - minY + 8 / viewport.zoom);
    const size = 8 / viewport.zoom;
    context.setLineDash([]);
    context.fillStyle = "#fff";
    context.strokeStyle = "#4c7dff";
    for (const p of [{x:minX,y:minY},{x:(minX+maxX)/2,y:minY},{x:maxX,y:minY},{x:maxX,y:(minY+maxY)/2},{x:maxX,y:maxY},{x:(minX+maxX)/2,y:maxY},{x:minX,y:maxY},{x:minX,y:(minY+maxY)/2}]) {
      context.fillRect(p.x-size/2,p.y-size/2,size,size); context.strokeRect(p.x-size/2,p.y-size/2,size,size);
    }
  }

  for (const element of activeElements.length > 1 ? [] : activeElements) {
    if (element.isDeleted) continue;

    const corners = expandCorners(
      getElementCorners(element),
      4 / viewport.zoom,
    );
    const first = corners[0];

    if (!first) continue;

    context.beginPath();
    context.moveTo(first.x, first.y);

    for (let i = 1; i < corners.length; i += 1) {
      const corner = corners[i];
      if (corner) context.lineTo(corner.x, corner.y);
    }

    context.closePath();
    context.stroke();
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

      for (const { point } of getResizeHandles(element, viewport.zoom)) {
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
    }
  }

  if (pointEditingElement && "points" in pointEditingElement) {
    context.setLineDash([]); context.fillStyle = "#ffffff"; context.strokeStyle = "#4c7dff";
    for (const p of pointEditingElement.points) {
      const x = pointEditingElement.x + p.x, y = pointEditingElement.y + p.y, size = 8 / viewport.zoom;
      context.beginPath(); context.arc(x,y,size/2,0,Math.PI*2); context.fill(); context.stroke();
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
