import { describe, expect, it } from "vitest";
import type { Element } from "@repo/common";
import {
  mermaidToCanvasElements,
  mergeDiagramElements,
  parseMermaid,
} from "./mermaidParser";

function boxesOverlap(
  a: { x: number; y: number; width?: number; height?: number },
  b: { x: number; y: number; width?: number; height?: number },
): boolean {
  const aw = a.width ?? 0;
  const ah = a.height ?? 0;
  const bw = b.width ?? 0;
  const bh = b.height ?? 0;
  return a.x < b.x + bw && a.x + aw > b.x && a.y < b.y + bh && a.y + ah > b.y;
}

describe("Mermaid parser and auto-layout engine", () => {
  it("lays out a 10-node architecture diagram with zero overlapping shapes", () => {
    const mermaid = `
      graph TD
        Client[Web Client] --> Edge[Cloudflare Edge]
        Edge --> Api[HTTP API]
        Edge --> Ws[WebSocket Server]
        Api --> Auth[Better Auth]
        Api --> Redis[(Redis Cluster)]
        Ws --> Redis
        Redis --> Queue[BullMQ Queue]
        Queue --> Worker[Flush Worker]
        Worker --> Postgres[(PostgreSQL)]
        Api --> S3[(R2 Object Storage)]
    `;

    const { parsed, elements } = mermaidToCanvasElements(mermaid, {
      diagramGroupId: "arch-1",
    });

    expect(parsed.errors).toHaveLength(0);
    expect(parsed.nodes).toHaveLength(10);
    expect(parsed.edges).toHaveLength(10);

    const shapes = elements.filter(
      (el) =>
        el.type === "rectangle" ||
        el.type === "diamond" ||
        el.type === "ellipse",
    );
    expect(shapes).toHaveLength(10);

    // Assert strictly zero overlapping node bounding boxes
    for (let i = 0; i < shapes.length; i += 1) {
      for (let j = i + 1; j < shapes.length; j += 1) {
        expect(boxesOverlap(shapes[i]!, shapes[j]!)).toBe(false);
      }
    }
  });

  it("parses sequenceDiagram and stateDiagram-v2 syntax", () => {
    const seq = parseMermaid(`
      sequenceDiagram
        Client->>Server: Commit elements
        Server->>Redis: Lua Delta CAS
    `);
    expect(seq.kind).toBe("sequence");
    expect(seq.nodes).toHaveLength(3);
    expect(seq.edges).toHaveLength(2);
    expect(seq.edges[0]!.label).toBe("Commit elements");

    const state = parseMermaid(`
      stateDiagram-v2
        [*] --> Idle
        Idle --> Syncing : edit
        Syncing --> Saved : ack
    `);
    expect(state.kind).toBe("state");
    expect(state.nodes.length).toBeGreaterThanOrEqual(4);
    expect(state.edges).toHaveLength(3);
  });

  it("replaces only the linked diagramGroupId while preserving unrelated canvas elements", () => {
    const unrelated = {
      id: "user-hand-drawn-1",
      type: "rectangle",
      x: 10,
      y: 10,
      width: 50,
      height: 50,
      groupIds: [],
    } as unknown as Element;

    const v1 = mermaidToCanvasElements("graph LR\nA[Old A] --> B[Old B]", {
      diagramGroupId: "group-42",
    });
    const combined = mergeDiagramElements([unrelated], v1.elements, "insert", "group-42");

    const v2 = mermaidToCanvasElements("graph LR\nA[Updated A] --> B[Updated B]", {
      diagramGroupId: "group-42",
    });
    const replaced = mergeDiagramElements(combined, v2.elements, "replace", "group-42");

    expect(replaced.some((e) => e.id === "user-hand-drawn-1")).toBe(true);
    const texts = replaced
      .filter((e) => e.type === "text")
      .map((e) => (e as { text?: string }).text);
    expect(texts).toContain("Updated A");
    expect(texts).not.toContain("Old A");
  });
});
