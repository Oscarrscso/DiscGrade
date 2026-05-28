import test from "node:test";
import assert from "node:assert/strict";

import { RequestScheduler } from "../core/rateLimiter.ts";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("request scheduler enforces per-host minimum interval", async () => {
  const scheduler = new RequestScheduler(20, 1, 4);
  const starts: number[] = [];

  await Promise.all(
    [1, 2, 3].map((index) =>
      scheduler.schedule(`https://example.com/${index}`, async () => {
        starts.push(Date.now());
        await sleep(1);
        return index;
      })
    )
  );

  assert.ok(starts[1] - starts[0] >= 18);
  assert.ok(starts[2] - starts[1] >= 18);
});

test("request scheduler enforces host and global concurrency and allows cross-host progress", async () => {
  const scheduler = new RequestScheduler(0, 1, 2);
  let active = 0;
  let maxActive = 0;
  const started: string[] = [];

  await Promise.all([
    scheduler.schedule("https://a.example.com/1", async () => {
      started.push("a1");
      active += 1;
      maxActive = Math.max(maxActive, active);
      await sleep(40);
      active -= 1;
      return "a1";
    }),
    scheduler.schedule("https://a.example.com/2", async () => {
      started.push("a2");
      active += 1;
      maxActive = Math.max(maxActive, active);
      await sleep(5);
      active -= 1;
      return "a2";
    }),
    scheduler.schedule("https://b.example.com/1", async () => {
      started.push("b1");
      active += 1;
      maxActive = Math.max(maxActive, active);
      await sleep(5);
      active -= 1;
      return "b1";
    })
  ]);

  assert.ok(maxActive <= 2);
  assert.deepEqual(started.slice(0, 2).sort(), ["a1", "b1"]);
});
