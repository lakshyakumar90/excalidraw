import type { Point } from "@repo/common";

export function sampleCanvasColor(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  point: Point,
): string | null {
  const rect = canvas.getBoundingClientRect();
  if (
    rect.width <= 0 ||
    rect.height <= 0 ||
    point.x < 0 ||
    point.y < 0 ||
    point.x >= rect.width ||
    point.y >= rect.height
  ) {
    return null;
  }

  const pixelX = Math.floor((point.x / rect.width) * canvas.width);
  const pixelY = Math.floor((point.y / rect.height) * canvas.height);

  try {
    const pixel = context.getImageData(pixelX, pixelY, 1, 1).data;
    const red = pixel[0];
    const green = pixel[1];
    const blue = pixel[2];
    const alpha = pixel[3];
    if (
      red === undefined ||
      green === undefined ||
      blue === undefined ||
      alpha === undefined
    ) {
      return null;
    }
    if (alpha === 0) return "transparent";

    return `#${[red, green, blue]
      .map((channel) => channel.toString(16).padStart(2, "0"))
      .join("")}`;
  } catch {
    return null;
  }
}
