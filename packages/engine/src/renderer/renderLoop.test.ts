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

  it("tracks render statistics", () => {
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
  
    frameCallback!(0);
    frameCallback!(16);
    frameCallback!(32);
  
    const stats =
      loop.getStats();
  
    expect(
      stats.frameCount,
    ).toBe(3);
  
    expect(
      stats.staticRenderCount,
    ).toBe(1);
  
    expect(
      stats.interactiveRenderCount,
    ).toBe(3);
  
    loop.invalidateStatic();
  
    frameCallback!(48);
  
    const updatedStats =
      loop.getStats();
  
    expect(
      updatedStats.staticRenderCount,
    ).toBe(2);
  
    expect(
      updatedStats.interactiveRenderCount,
    ).toBe(4);
  
    loop.stop();
  });

  it("calculates FPS from frame timestamps", () => {
    let frameCallback:
      FrameRequestCallback | null = null;
  
    const state =
      createRenderState();
  
    const loop =
      new RenderLoop(
        state,
        {
          renderStatic: () => {},
          renderInteractive: () => {},
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
  
    for (
      let timestamp = 0;
      timestamp <= 2000;
      timestamp += 16
    ) {
      frameCallback!(timestamp);
    }
  
    const stats =
      loop.getStats();
  
    expect(stats.fps).toBeGreaterThan(50);
    expect(stats.fps).toBeLessThan(70);
  
    loop.stop();
  });
});