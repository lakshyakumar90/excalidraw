import { getCurrentViewport } from "@/lib/persistence/viewportStore";
import { frameForElement } from "@repo/engine";
import { ToolManager } from "@repo/engine";
import { scene } from "@/lib/scene/scene";
import { styleStore } from "@/lib/styles/styleStore";
import { bindArrowToScene } from "@/lib/selection/arrowBinding";

export const toolManager = new ToolManager({
  onCommit: (element) => {
    const styledElement = { ...element, ...styleStore.getElementStyle() };
    scene.addElement(
      styledElement.type === "arrow"
        ? bindArrowToScene(styledElement, getCurrentViewport().zoom)
        : {
            ...styledElement,
            frameId: frameForElement(styledElement, scene.getElements()),
          },
    );
    if (styledElement.type === "frame") {
      for (const child of scene.getElements())
        if (child.type !== "frame" && !child.isDeleted)
          scene.mutateElement(child.id, {
            frameId: frameForElement(child, scene.getElements()),
          });
    }

    // Once a shape/stroke is created, return to the select (V) arrow so the
    // new element can be moved or resized straight away. Defer to a microtask
    // so the current pointer/key handler can finish committing history first.
    queueMicrotask(() => {
      if (toolManager.getActiveTool() !== "selection") {
        toolManager.setActiveTool("selection");
      }
    });
  },
});
