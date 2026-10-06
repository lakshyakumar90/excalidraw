import { ToolManager } from "@repo/engine";
import { scene } from "@/lib/scene/scene";
import { styleStore } from "@/lib/styles/styleStore";

export const toolManager = new ToolManager({
  onCommit: (element) => {
    scene.addElement({ ...element, ...styleStore.getElementStyle() });
  },
});
