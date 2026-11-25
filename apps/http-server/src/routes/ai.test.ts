import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { aiRouter, AiDiagramPlanSchema } from "./ai.js";

test("POST /api/ai/generate-diagram returns validated topological steps for templates and local CLI bridges", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/ai", aiRouter);

  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Template / offline mode
    const res1 = await fetch(`${baseUrl}/api/ai/generate-diagram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Draw a Redis write-behind architecture",
        provider: "template",
      }),
    });
    assert.equal(res1.status, 200);
    const body1 = (await res1.json()) as { mode: string; plan: unknown };
    assert.equal(body1.mode, "local-template");
    const parsed1 = AiDiagramPlanSchema.parse(body1.plan);
    assert.ok(parsed1.steps.length >= 3);

    // 2. Local CLI bridges (OpenCode, Codex CLI, AntiGravity CLI)
    for (const cli of ["opencode", "codex-cli", "antigravity-cli"] as const) {
      const resCli = await fetch(`${baseUrl}/api/ai/generate-diagram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "Draw our RAG pipeline",
          provider: cli,
          roomId: "room-7",
        }),
      });
      assert.equal(resCli.status, 200);
      const bodyCli = (await resCli.json()) as {
        mode: string;
        cliCommand: string;
        plan: unknown;
      };
      assert.equal(bodyCli.mode, "local-cli-bridge");
      assert.ok(bodyCli.cliCommand.includes("room-7"));
      assert.ok(AiDiagramPlanSchema.parse(bodyCli.plan).steps.length >= 3);
    }

    // 3. Invalid request rejected with 400
    const resBad = await fetch(`${baseUrl}/api/ai/generate-diagram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "x" }),
    });
    assert.equal(resBad.status, 400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
