import type { SketchCommand } from "./geometry";

export function traceSketchPath(
  context: CanvasRenderingContext2D,
  commands: readonly SketchCommand[],
): void {
  context.beginPath();
  for (const command of commands) {
    switch (command.type) {
      case "M":
        context.moveTo(command.x, command.y);
        break;
      case "L":
        context.lineTo(command.x, command.y);
        break;
      case "Q":
        context.quadraticCurveTo(command.cx, command.cy, command.x, command.y);
        break;
      case "C":
        context.bezierCurveTo(
          command.c1x,
          command.c1y,
          command.c2x,
          command.c2y,
          command.x,
          command.y,
        );
        break;
      case "Z":
        context.closePath();
        break;
    }
  }
}

export function sketchPathToSvg(commands: readonly SketchCommand[]): string {
  return commands
    .map((command) => {
      switch (command.type) {
        case "M":
          return `M ${command.x} ${command.y}`;
        case "L":
          return `L ${command.x} ${command.y}`;
        case "Q":
          return `Q ${command.cx} ${command.cy} ${command.x} ${command.y}`;
        case "C":
          return `C ${command.c1x} ${command.c1y} ${command.c2x} ${command.c2y} ${command.x} ${command.y}`;
        case "Z":
          return "Z";
      }
    })
    .join(" ");
}
