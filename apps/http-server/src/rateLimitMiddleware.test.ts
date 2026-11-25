import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import {
  configureGlobalRateLimiter,
  createSlidingWindowRateLimiter,
  resetInMemoryRateLimits,
} from "./rateLimitMiddleware.js";

test("sliding-window HTTP rate limiter allows 120 req/min and returns 429 on request 121", async () => {
  configureGlobalRateLimiter(null);
  resetInMemoryRateLimits();

  const app = express();
  app.use(
    createSlidingWindowRateLimiter({
      bucket: "test-global",
      limit: 120,
      windowMs: 60_000,
    }),
  );
  app.get("/ping", (_req, res) => {
    res.json({ ok: true });
  });

  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    for (let i = 0; i < 120; i += 1) {
      const res = await fetch(`${baseUrl}/ping`);
      assert.equal(res.status, 200, `Request ${i + 1} should succeed`);
    }
    const blocked = await fetch(`${baseUrl}/ping`);
    assert.equal(blocked.status, 429);
    const retryAfter = blocked.headers.get("retry-after");
    assert.ok(retryAfter && Number(retryAfter) >= 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
