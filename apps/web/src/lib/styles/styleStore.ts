export type FillStyle = "none" | "solid" | "hachure" | "cross-hatch";
export type StrokeStyle = "solid" | "dashed" | "dotted";
export type EdgeStyle = "sharp" | "rounded";

export interface CurrentItemStyle {
  strokeColor: string;
  backgroundColor: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  roughness: number;
  edgeStyle: EdgeStyle;
  opacity: number;
}

type Listener = () => void;

const DEFAULT_STYLE: CurrentItemStyle = {
  strokeColor: "#000000",
  backgroundColor: "transparent",
  fillStyle: "none",
  strokeWidth: 1,
  strokeStyle: "solid",
  roughness: 1,
  edgeStyle: "sharp",
  opacity: 100,
};

let currentItemStyle = DEFAULT_STYLE;
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) listener();
}

export const styleStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot(): CurrentItemStyle {
    return currentItemStyle;
  },

  set<K extends keyof CurrentItemStyle>(key: K, value: CurrentItemStyle[K]) {
    if (Object.is(currentItemStyle[key], value)) return;
    currentItemStyle = { ...currentItemStyle, [key]: value };
    notify();
  },
};
