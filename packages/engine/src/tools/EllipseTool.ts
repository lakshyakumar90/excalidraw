import { createEllipseElement } from "../element/factory";
import { ShapeTool } from "./ShapeTool";

export class EllipseTool extends ShapeTool<
  ReturnType<typeof createEllipseElement>
> {
  readonly type = "ellipse";

  constructor() {
    super({
      type: "ellipse",
      createElement: createEllipseElement,
    });
  }
}
