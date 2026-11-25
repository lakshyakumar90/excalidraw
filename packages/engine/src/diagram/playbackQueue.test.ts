import { describe, expect, it } from "vitest";
import type { Element } from "@repo/common";
import { TimedPlaybackQueue } from "./playbackQueue";

function dummyEl(id: string): Element {
  return { id, type: "rectangle", x: 0, y: 0, width: 100, height: 50 } as unknown as Element;
}

describe("TimedPlaybackQueue", () => {
  it("reveals topological steps sequentially and supports pause/resume/skipToEnd", async () => {
    const revealed: string[] = [];
    const queue = new TimedPlaybackQueue(
      [
        { title: "Step 1: Clients", elements: [dummyEl("a")] },
        { title: "Step 2: Services", elements: [dummyEl("b")] },
        { title: "Step 3: Database", elements: [dummyEl("c")] },
      ],
      {
        stepDelayMs: 60,
        onRevealStep: (step) => revealed.push(step.title),
      },
    );

    queue.start();
    // Step 1 reveals immediately
    expect(revealed).toEqual(["Step 1: Clients"]);
    queue.pause();
    expect(queue.getStatus()).toBe("paused");

    await new Promise((r) => setTimeout(r, 90));
    expect(revealed).toEqual(["Step 1: Clients"]);

    queue.skipToEnd();
    expect(revealed).toEqual([
      "Step 1: Clients",
      "Step 2: Services",
      "Step 3: Database",
    ]);
    expect(queue.getStatus()).toBe("completed");
  });
});
