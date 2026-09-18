import {
  describe,
  expect,
  it,
} from "vitest";

import {
  createRenderState,
} from "./renderState";

import {
  RenderLoop,
} from "./RenderLoop";

describe("RenderLoop", () => {
  it("renders static content only when dirty", () => {
    let frameCallback:
      FrameRequestCallback | null = null;

    let staticRenderCount = 0;
    let interactiveRenderCount = 0;

    const state =
      createRenderState();

    const loop =
      new RenderLoop(
        state,
        {
          renderStatic: () => {
            staticRenderCount += 1;
          },

          renderInteractive: () => {
            interactiveRenderCount += 1;
          },
        },
        {
          requestFrame: (callback) => {
            frameCallback = callback;
            return 1;
          },

          cancelFrame: () => {},
        },
      );

    loop.start();

    expect(frameCallback).not.toBeNull();

    frameCallback!(0);

    expect(staticRenderCount).toBe(1);
    expect(interactiveRenderCount).toBe(1);

    frameCallback!(16);

    expect(staticRenderCount).toBe(1);
    expect(interactiveRenderCount).toBe(2);

    loop.invalidateStatic();

    frameCallback!(32);

    expect(staticRenderCount).toBe(2);
    expect(interactiveRenderCount).toBe(3);

    loop.stop();
  });
});