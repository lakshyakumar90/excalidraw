export interface RenderState {
  staticDirty: boolean;
  interactiveDirty: boolean;
}

export function createRenderState(): RenderState {
  return {
    staticDirty: true,
    interactiveDirty: true,
  };
}

