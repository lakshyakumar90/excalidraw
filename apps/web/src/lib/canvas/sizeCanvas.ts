/** Backing pixels only affect sharpness; scene coordinates stay in CSS pixels. */
export function sizeCanvas(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  size: { width: number; height: number },
  pixelRatio: number,
): void {
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  canvas.width = Math.max(1, Math.round(size.width * ratio));
  canvas.height = Math.max(1, Math.round(size.height * ratio));
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  context.setTransform(
    size.width > 0 ? canvas.width / size.width : ratio,
    0, 0,
    size.height > 0 ? canvas.height / size.height : ratio,
    0, 0,
  );
}
