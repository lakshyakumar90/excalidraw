import { describe, expect, it } from "vitest";
import { createThrottledPublisher } from "./throttle";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("createThrottledPublisher", () => {
  it("publishes immediately, then throttles with a trailing update", async () => {
    const published: number[] = [];
    const publisher = createThrottledPublisher(30, (value: number) => {
      published.push(value);
    });
    publisher.push(1);
    publisher.push(2);
    publisher.push(3);
    expect(published).toEqual([1]);
    await sleep(60);
    // Only the latest value follows the burst.
    expect(published).toEqual([1, 3]);
  });

  it("flushes pending values and drops them on cancel", async () => {
    const published: number[] = [];
    const publisher = createThrottledPublisher(50, (value: number) => {
      published.push(value);
    });
    publisher.push(1);
    publisher.push(2);
    publisher.flush();
    expect(published).toEqual([1, 2]);

    publisher.push(3);
    publisher.push(4);
    publisher.cancel();
    await sleep(80);
    // Cancel drops the pending trailing update.
    expect(published).toEqual([1, 2]);
  });
});
