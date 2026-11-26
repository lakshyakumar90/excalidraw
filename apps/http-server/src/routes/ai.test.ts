import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import {
  aiRouter,
  AiDiagramPlanSchema,
  GenerateDiagramRequestSchema,
} from "./ai.js";

test("POST /api/ai/generate-diagram rejects removed template provider, missing BYOK keys, and invalid requests", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/ai", aiRouter);

  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  const prevOpenAi = process.env.OPENAI_API_KEY;
  const prevAnthropic = process.env.ANTHROPIC_API_KEY;
  const prevGemini = process.env.GEMINI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;

  try {
    // 1. Removed template provider is rejected with 400
    const resTemplate = await fetch(`${baseUrl}/api/ai/generate-diagram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Draw a Redis write-behind architecture",
        provider: "template",
      }),
    });
    assert.equal(resTemplate.status, 400);

    // 2. BYOK providers without an API key are rejected with 400 (no silent fallback)
    for (const provider of ["openai-compatible", "anthropic", "gemini"] as const) {
      const resNoKey = await fetch(`${baseUrl}/api/ai/generate-diagram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "Draw our RAG pipeline",
          provider,
        }),
      });
      assert.equal(resNoKey.status, 400);
      const body = (await resNoKey.json()) as { error?: string };
      assert.ok(body.error?.includes("API key is required"));
    }

    // 3. Invalid short prompt is rejected with 400
    const resBad = await fetch(`${baseUrl}/api/ai/generate-diagram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "x" }),
    });
    assert.equal(resBad.status, 400);

    // 4. Request schema accepts multi-turn history and local CLI providers
    const parsedReq = GenerateDiagramRequestSchema.parse({
      prompt: "Add a Redis cache between API and Postgres",
      provider: "opencode",
      history: [
        { role: "user", content: "Draw a URL shortener" },
        { role: "assistant", content: "URL Shortener Architecture" },
      ],
    });
    assert.equal(parsedReq.history.length, 2);

    // 5. Plan schema validates topological steps
    const parsedPlan = AiDiagramPlanSchema.parse({
      summary: "URL Shortener with Redis",
      steps: [
        {
          title: "Step 1: Edge",
          mermaidChunk: "graph TD\n  Client --> API",
        },
      ],
    });
    assert.equal(parsedPlan.steps.length, 1);
  } finally {
    if (prevOpenAi !== undefined) process.env.OPENAI_API_KEY = prevOpenAi;
    if (prevAnthropic !== undefined) process.env.ANTHROPIC_API_KEY = prevAnthropic;
    if (prevGemini !== undefined) process.env.GEMINI_API_KEY = prevGemini;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
