import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { createCollaborationService } from "@repo/backend-common";
import { configureMcpServerDeps, mcpRouter } from "./mcp.js";
import { createRoomApiToken } from "./mcpTokens.js";

test("POST /api/mcp handles initialize, tools/list, tools/call with live room broadcast, and returns 401 when token is revoked", async () => {
  let revision = 0;
  let storedData: unknown = { elements: [], sync: { revision: 0, tombstones: {} } };
  const publishedEvents: Record<string, unknown>[] = [];

  const collab = createCollaborationService({
    store: {} as never,
    queries: {
      readHead: async () => ({ revision, data: storedData }),
      readLegacy: async () => null,
      appendRevision: async (_sceneId, nextRev, data) => {
        revision = nextRev;
        storedData = data;
      },
      pruneRevisions: async () => undefined,
    },
  });

  const { token, record } = createRoomApiToken({
    roomId: 42,
    sceneId: "scene-mcp-42",
    role: "editor",
    createdById: "user-owner",
  });
  let revoked = false;
  configureMcpServerDeps({
    verifyToken: async (value) => !revoked && value === token ? record : null,
    getCollaborationService: () => collab,
    getRoomRedis: () => ({
      publish: async (event) => {
        publishedEvents.push(event);
      },
    }),
  });

  const app = express();
  app.use(express.json());
  app.use("/api/mcp", mcpRouter);

  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}/api/mcp`;

  try {
    // 1. initialize
    const initRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    });
    assert.equal(initRes.status, 200);
    const initJson = (await initRes.json()) as {
      result: { serverInfo: { name: string } };
    };
    assert.equal(initJson.result.serverInfo.name, "excalidraw-room-mcp");

    // 2. tools/list
    const listRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    });
    assert.equal(listRes.status, 200);
    const listJson = (await listRes.json()) as {
      result: { tools: { name: string }[] };
    };
    const toolNames = listJson.result.tools.map((t) => t.name);
    assert.deepEqual(toolNames, [
      "get_scene_outline",
      "create_diagram_from_graph",
      "mermaid_to_canvas",
      "patch_elements",
      "render_scene_svg",
    ]);

    // 3. tools/call create_diagram_from_graph -> commits + broadcasts elements.committed
    const callRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "create_diagram_from_graph",
          arguments: {
            direction: "LR",
            nodes: [
              { id: "client", label: "Browser", shape: "rectangle" },
              { id: "redis", label: "Redis CAS", shape: "rectangle" },
            ],
            edges: [{ from: "client", to: "redis", label: "WS" }],
          },
        },
      }),
    });
    assert.equal(callRes.status, 200);
    const callJson = (await callRes.json()) as {
      result: { content: { text: string }[] };
    };
    const commitSummary = JSON.parse(callJson.result.content[0]!.text) as {
      committed: boolean;
      revision: number;
      elementCount: number;
    };
    assert.equal(commitSummary.committed, true);
    assert.equal(commitSummary.revision, 1);
    assert.ok(commitSummary.elementCount >= 5);

    // Verify Redis Pub/Sub broadcast emitted elements.committed for room 42
    assert.equal(publishedEvents.length, 1);
    assert.equal(publishedEvents[0]!.type, "room.broadcast");
    assert.equal(publishedEvents[0]!.roomId, 42);
    assert.equal(
      (publishedEvents[0]!.message as { type: string }).type,
      "elements.committed",
    );

    // 4. render_scene_svg visual self-check
    const svgRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "render_scene_svg", arguments: { theme: "dark" } },
      }),
    });
    const svgJson = (await svgRes.json()) as {
      result: { content: { text: string }[] };
    };
    assert.ok(svgJson.result.content[0]!.text.startsWith("<svg "));

    // 5. Revoke token -> immediate 401
    revoked = true;
    const revokedRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/list" }),
    });
    assert.equal(revokedRes.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
