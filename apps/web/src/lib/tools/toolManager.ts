import { ToolManager } from "@repo/engine";
import { scene } from "@/lib/scene/scene";

export const toolManager = new ToolManager({
  onCommit: (element) => {
    scene.addElement(element);
  },
});
