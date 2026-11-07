import { describe, expect, it } from "vitest";
import { check_artifact_compat, negotiate_bridge } from "../../src/platform/version";
import { capability_table, detect_host } from "../../src/platform/capabilities";

describe("bridge version negotiation", () => {
  it("要求版本不高于当前版本时支持", () => {
    expect(negotiate_bridge(1, "desktop", 1).supported).toBe(true);
  });

  it("要求版本高于当前版本时拒绝", () => {
    expect(negotiate_bridge(2, "harmony", 1).supported).toBe(false);
  });

  it("协商结果包含宿主与桥版本", () => {
    const result = negotiate_bridge(1, "android", 1);
    expect(result.host).toBe("android");
    expect(result.bridge_version).toBe(1);
  });
});

describe("capability table", () => {
  it("node 环境识别为 browser 宿主", () => {
    expect(detect_host()).toBe("browser");
  });

  it("能力表含状态、桥版本与宿主", async () => {
    const table = await capability_table("browser");
    expect(table.host).toBe("browser");
    expect(table.bridge_version).toBe(1);
    expect(table.entries.transport.state).toBe("AVAILABLE");
    expect(table.entries.credential.state).toBe("DEGRADED");
    expect(table.entries.git.state).toBe("UNAVAILABLE");
  });
});

describe("artifact compatibility", () => {
  it("旧壳加载新产物时提示升级", () => {
    const result = check_artifact_compat({ min_bridge_version: 2 }, 1);
    expect(result.compatible).toBe(false);
    expect(result.reason).toBe("BRIDGE_TOO_OLD");
    expect(result.message).toContain("升级");
  });

  it("新壳加载旧产物保持兼容", () => {
    expect(check_artifact_compat({ min_bridge_version: 1 }, 2).compatible).toBe(true);
  });
});