import type { Point } from "@repo/common";

export type EyedropperTarget = "strokeColor" | "backgroundColor";

export interface EyedropperState {
  target: EyedropperTarget | null;
  point: Point | null;
  color: string | null;
}

type Listener = () => void;

const IDLE_STATE: EyedropperState = {
  target: null,
  point: null,
  color: null,
};

let state = IDLE_STATE;
const listeners = new Set<Listener>();
const modeListeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener();
}

function notifyMode(): void {
  for (const listener of modeListeners) listener();
}

export const eyedropperStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  subscribeMode(listener: Listener): () => void {
    modeListeners.add(listener);
    return () => modeListeners.delete(listener);
  },

  getSnapshot(): EyedropperState {
    return state;
  },

  getTarget(): EyedropperTarget | null {
    return state.target;
  },

  activate(target: EyedropperTarget): void {
    state = { target, point: null, color: null };
    notifyMode();
    notify();
  },

  updatePointer(point: Point, color: string | null): void {
    if (!state.target) return;
    state = { ...state, point, color };
    notify();
  },

  cancel(): void {
    if (!state.target) return;
    state = IDLE_STATE;
    notifyMode();
    notify();
  },
};
