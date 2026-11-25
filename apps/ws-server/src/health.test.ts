import { test } from "node:test";
import assert from "node:assert/strict";
import { startPresenceServer } from "./server.js";

test("ws-server /health returns 200 when Postgres and Redis are healthy, and 503 when Redis fails", async () => {
  let redisHealthy = true;
  let dbHealthy = true;

  const fakeRoomRedis = {
    instanceId: "test-instance",
    subscribe: async () => ({
      quit: async () => undefined,
      unsubscribe: async () => undefined,
    }),
    ping: async () => redisHealthy,
    join: async () => undefined,
    leave: async () => 0,
    renew: async () => undefined,
    listParticipants: async () => [],
    publish: async () => undefined,
  };

  const handle = await startPresenceServer({
    verifyTicket: () => ({ userId: "u1", roomId: 1, ticketId: "t1" }),
    checkAccess: async () => true,
    resolveDisplayName: async () => "Tester",
    roomRedis: fakeRoomRedis as never,
    checkDbHealth: async () => dbHealthy,
    port: 0,
  });

  try {
    const baseUrl = `http://127.0.0.1:${handle.port}`;

    // Healthy -> 200
    const resOk = await fetch(`${baseUrl}/health`);
    assert.equal(resOk.status, 200);
    const bodyOk = (await resOk.json()) as {
      status: string;
      checks: { postgres: string; redis: string };
    };
    assert.equal(bodyOk.status, "ok");
    assert.equal(bodyOk.checks.postgres, "ok");
    assert.equal(bodyOk.checks.redis, "ok");

    // Redis stopped -> 503
    redisHealthy = false;
    const resRedisDown = await fetch(`${baseUrl}/health`);
    assert.equal(resRedisDown.status, 503);
    const bodyRedisDown = (await resRedisDown.json()) as {
      status: string;
      checks: { postgres: string; redis: string };
    };
    assert.equal(bodyRedisDown.status, "degraded");
    assert.equal(bodyRedisDown.checks.redis, "error");

    // Postgres down -> 503
    redisHealthy = true;
    dbHealthy = false;
    const resDbDown = await fetch(`${baseUrl}/health`);
    assert.equal(resDbDown.status, 503);
    const bodyDbDown = (await resDbDown.json()) as {
      checks: { postgres: string; redis: string };
    };
    assert.equal(bodyDbDown.checks.postgres, "error");
    assert.equal(bodyDbDown.checks.redis, "ok");
  } finally {
    await handle.close();
  }
});
