import assert from "node:assert/strict";
import { test } from "node:test";
import { startMaintenance } from "./maintenance.js";

const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

test("recovery scans on startup, then once a minute, and stops cleanly", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let scans = 0;
  const stop = startMaintenance(
    async () => {
      scans++;
    },
    60_000,
    (error) => {
      throw error;
    },
  );
  await settle();
  assert.equal(scans, 1);
  t.mock.timers.tick(59_999);
  assert.equal(scans, 1);
  t.mock.timers.tick(1);
  await settle();
  assert.equal(scans, 2);
  stop();
  t.mock.timers.tick(120_000);
  assert.equal(scans, 2);
});

test("slow Redis requests never overlap and shutdown prevents rescheduling", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let finish!: () => void;
  let scans = 0;
  const stop = startMaintenance(
    async () => {
      scans++;
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    },
    60_000,
    (error) => {
      throw error;
    },
  );
  t.mock.timers.tick(600_000);
  assert.equal(scans, 1);
  stop();
  finish();
  await settle();
  t.mock.timers.tick(600_000);
  assert.equal(scans, 1);
});

test("a failed scan is reported and retried after the interval", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const failure = new Error("Redis unavailable");
  const errors: unknown[] = [];
  let scans = 0;
  const stop = startMaintenance(
    async () => {
      if (++scans === 1) throw failure;
    },
    60_000,
    (error) => errors.push(error),
  );
  await settle();
  assert.deepEqual(errors, [failure]);
  t.mock.timers.tick(60_000);
  await settle();
  assert.equal(scans, 2);
  stop();
});
