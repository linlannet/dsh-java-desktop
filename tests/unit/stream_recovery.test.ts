import { describe, expect, it } from "vitest";
import {
  RECONCILE_POLL_MS,
  next_backoff,
  reconcile_poll,
} from "../../src/lib/stream_recovery";

describe("stream recovery", () => {
  it("对账默认 5s 一轮", () => {
    expect(RECONCILE_POLL_MS).toBe(5_000);
  });

  it("退避曲线 1s→15s 封顶", () => {
    expect(next_backoff(1)).toBe(1_000);
    expect(next_backoff(2)).toBe(2_000);
    expect(next_backoff(3)).toBe(4_000);
    expect(next_backoff(4)).toBe(8_000);
    expect(next_backoff(5)).toBe(15_000);
    expect(next_backoff(99)).toBe(15_000);
  });

  it("首轮已完成不轮询", async () => {
    let calls = 0;
    const value = await reconcile_poll(
      async () => {
        calls += 1;
        return { done: true };
      },
      (v) => v.done,
      { poll_ms: 0 },
    );
    expect(value.done).toBe(true);
    expect(calls).toBe(1);
  });

  it("未完成时持续轮询直到完成", async () => {
    let calls = 0;
    const value = await reconcile_poll(
      async () => {
        calls += 1;
        return { done: calls >= 3 };
      },
      (v) => v.done,
      { poll_ms: 0 },
    );
    expect(value.done).toBe(true);
    expect(calls).toBe(3);
  });

  it("达到最大轮次后返回最后一次结果", async () => {
    const value = await reconcile_poll(
      async () => ({ done: false }),
      (v) => v.done,
      { poll_ms: 0, max_polls: 2 },
    );
    expect(value.done).toBe(false);
  });

  it("取消时抛 AbortError", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      reconcile_poll(async () => ({ done: false }), (v) => v.done, {
        poll_ms: 0,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});