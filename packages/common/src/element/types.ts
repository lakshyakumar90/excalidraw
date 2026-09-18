import type { Point } from "../types";

export type ElementType =
  "rectangle" | "ellipse" | "diamond" | "line" | "arrow" | "freedraw" | "text";

export type FillStyle = "solid" | "hachure" | "cross-hatch" | "none";

export type StrokeStyle = "solid" | "dashed" | "dotted";

export type StrokeWidth = number;

export interface BaseElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  angle?: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: FillStyle;
  strokeStyle?: StrokeStyle;
  strokeWidth?: StrokeWidth;
  roughness?: number;
  opacity?: number;
  seed?: number;
  groupIds?: string[];
  boundElements?: string[];
  frameId?: string | null;
  version?: number;
  versionNonce?: number;
  isDeleted?: boolean;
  updated?: number;
}

export interface RectangleElement extends BaseElement {
  type: "rectangle";
}

export interface EllipseElement extends BaseElement {
  type: "ellipse";
}

export interface DiamondElement extends BaseElement {
  type: "diamond";
}

export interface LineElement extends BaseElement {
  type: "line";

  points: Array<{
    x: number;
    y: number;
  }>;
}

export interface LineElement extends BaseElement {
  type: "line";

  points: Point[];
}

export interface ArrowElement extends BaseElement {
  type: "arrow";

  points: Point[];
}

export interface FreedrawElement extends BaseElement {
  type: "freedraw";

  points: Point[];
}

export interface TextElement extends BaseElement {
  type: "text";
  text: string;
  fontSize: number;
  fontFamily: string;
  textAlign: "left" | "center" | "right";
  verticalAlign: "top" | "middle" | "bottom";
}

export type Element =
  | RectangleElement
  | EllipseElement
  | DiamondElement
  | LineElement
  | ArrowElement
  | FreedrawElement
  | TextElement;
