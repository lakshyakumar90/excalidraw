import type { Element } from "@repo/common";
import { measureText } from "@repo/engine";
import { scene } from "@/lib/scene/scene";

/**
 * Changes the font family of text elements and recalculates their dimensions
 * so the box always fits the text in the new face. Sticky notes keep their
 * fixed size; only their text face changes.
 */
export function setTextFontFamily(
  elements: readonly Element[],
  fontFamily: string,
): void {
  if (!fontFamily) return;

  for (const element of elements) {
    if (element.type === "sticky") {
      scene.mutateElement(element.id, { fontFamily });
      continue;
    }
    if (element.type !== "text") continue;

    const wrapWidth = element.wrapText
      ? Math.max(1, element.width ?? 0)
      : undefined;
    const layout = measureText(
      element.text,
      element.fontSize,
      fontFamily,
      wrapWidth,
    );
    scene.mutateElement(element.id, {
      fontFamily,
      width: wrapWidth === undefined ? Math.max(20, layout.width) : wrapWidth,
      height: Math.max(1, layout.height),
    });
  }
}
