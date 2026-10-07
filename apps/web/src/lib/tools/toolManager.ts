import { ToolManager } from "@repo/engine";
import { scene } from "@/lib/scene/scene";
import { styleStore } from "@/lib/styles/styleStore";
import { bindArrowToScene } from "@/lib/selection/arrowBinding";

export const toolManager = new ToolManager({
  onCommit: (element) => {
    const styledElement = { ...element, ...styleStore.getElementStyle() };
    scene.addElement(
      styledElement.type === "arrow"
        ? bindArrowToScene(styledElement)
        : styledElement,
    );
  },
});
