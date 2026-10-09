import { describe, expect, it } from "vitest";
import { LaserTrails } from "./laser";
const frame = (seq: number, gestureId = "g") => ({
  type: "laser.move" as const,
  connectionId: "c",
  userId: "u",
  gestureId,
  seq,
  points: [{ x: seq, y: 0 }],
});
describe("ephemeral laser trails", () => {
  it("ignores out-of-order points and fades using receiver time", () => {
    const trails = new LaserTrails();
    trails.receive(frame(2), 100);
    trails.receive(frame(1), 110);
    expect(trails.trails.get("c")?.points).toHaveLength(1);
    trails.prune(1100);
    expect(trails.trails.size).toBe(0);
  });
  it("ignores delayed frames from a retired gesture and bounds memory", () => {
    const trails = new LaserTrails();
    trails.receive(frame(1, "old"), 100);
    trails.receive(frame(1, "new"), 110);
    trails.receive(frame(2, "old"), 120);
    expect(trails.trails.get("c")?.gestureId).toBe("new");
    for (let i = 0; i < 150; i++) trails.receive(frame(i, "new"), 130);
    expect(trails.trails.get("c")?.points.length).toBeLessThanOrEqual(128);
    for (let i = 0; i < 120; i++)
      trails.receive({ ...frame(0), connectionId: String(i) }, 140);
    expect(trails.trails.size).toBeLessThanOrEqual(100);
  });
  it("clears departed connections", () => {
    const trails = new LaserTrails();
    trails.receive(frame(1), 0);
    trails.remove("c");
    expect(trails.trails.size).toBe(0);
  });
});
