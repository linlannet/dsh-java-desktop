import { describe, expect, it } from "vitest";
import { ConnectionStateMachine, backoff_delay } from "../../src/lib/connection_state";

describe("connection state machine", () => {
  it("默认 UNCONNECTED，连接成功后 CONNECTED", () => {
    const machine = new ConnectionStateMachine();
    expect(machine.current).toBe("UNCONNECTED");
    machine.on_connect_start();
    expect(machine.current).toBe("CONNECTING");
    machine.on_connected();
    expect(machine.current).toBe("CONNECTED");
  });

  it("连续失败进入 RECONNECTING 并给出退避", () => {
    const machine = new ConnectionStateMachine();
    expect(machine.on_failure().delay_ms).toBe(1_000);
    expect(machine.on_failure().delay_ms).toBe(2_000);
    const third = machine.on_failure();
    expect(machine.current).toBe("RECONNECTING");
    expect(third.delay_ms).toBe(4_000);
  });

  it("退避封顶 15s", () => {
    expect(backoff_delay(1)).toBe(1_000);
    expect(backoff_delay(2)).toBe(2_000);
    expect(backoff_delay(3)).toBe(4_000);
    expect(backoff_delay(4)).toBe(8_000);
    expect(backoff_delay(5)).toBe(15_000);
    expect(backoff_delay(99)).toBe(15_000);
  });

  it("鉴权失败停止自动重试，手动重试也不生效", () => {
    const machine = new ConnectionStateMachine();
    machine.on_auth_failed();
    expect(machine.current).toBe("AUTH_FAILED");
    expect(machine.can_auto_retry()).toBe(false);
    machine.manual_retry();
    expect(machine.current).toBe("AUTH_FAILED");
  });

  it("重置回到 UNCONNECTED", () => {
    const machine = new ConnectionStateMachine();
    machine.on_failure();
    machine.reset();
    expect(machine.current).toBe("UNCONNECTED");
    expect(machine.failure_count).toBe(0);
  });
});