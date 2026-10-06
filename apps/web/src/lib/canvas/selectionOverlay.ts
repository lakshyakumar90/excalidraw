import type { Element, Viewport } from "@repo/common";
import { getElementCorners } from "@repo/engine";
import type { MarqueePreview } from "@/lib/selection/selectionController";

export function drawSelectionOverlay(
  context: CanvasRenderingContext2D,
  viewport: Viewport,
  selectedElements: readonly Element[] | undefined,
  marquee: MarqueePreview | null,
): void {
  context.save();

  // Draw in scene coordinates, just like the canvas elements.
  context.translate(viewport.scrollX, viewport.scrollY);
  context.scale(viewport.zoom, viewport.zoom);

  context.lineWidth = 1 / viewport.zoom;
  context.strokeStyle = "#4c7dff";
  context.setLineDash([5 / viewport.zoom, 4 / viewport.zoom]);

  // Draw an outline around each selected element's rotated corners.
  for (const element of selectedElements ?? []) {
    if (element.isDeleted) continue;

    const corners = getElementCorners(element);
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

  // Show a temporary rectangle while dragging on empty canvas.
  if (marquee) {
    const x = Math.min(marquee.start.x, marquee.current.x);
    const y = Math.min(marquee.start.y, marquee.current.y);
    const width = Math.abs(marquee.current.x - marquee.start.x);
    const height = Math.abs(marquee.current.y - marquee.start.y);

    context.fillStyle = "rgba(76, 125, 255, 0.10)";
    context.fillRect(x, y, width, height);

    context.strokeStyle = "#4c7dff";
    context.strokeRect(x, y, width, height);
  }

  context.restore();
}