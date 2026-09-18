import { createDiamondElement } from "../element/factory";
import { ShapeTool } from "./ShapeTool";

export class DiamondTool extends ShapeTool<
  ReturnType<typeof createDiamondElement>
> {
  readonly type = "diamond";

  constructor() {
    super({
      type: "diamond",
      createElement: createDiamondElement,
    });
  }
}
