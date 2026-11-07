import { describe, expect, it } from "vitest";
import { collect_diagnostics, redact } from "../../src/platform/diagnostics";

describe("diagnostics", () => {
  it("脱敏 Bearer / sk / password / X-API-Key", () => {
    const text = "Authorization: Bearer abc.def sk-1234567890 password=hunter2 X-API-Key: key-123";
    const masked = redact(text);
    expect(masked).not.toContain("abc.def");
    expect(masked).not.toContain("sk-1234567890");
    expect(masked).not.toContain("hunter2");
    expect(masked).not.toContain("key-123");
  });

  it("诊断包含必备项", async () => {
    const report = await collect_diagnostics({
      shell_version: "0.1.0",
      artifact_hash: "abc123",
    });
    expect(report.host).toBe("browser");
    expect(report.shell_version).toBe("0.1.0");
    expect(report.artifact_hash).toBe("abc123");
    expect(report.bridge_version).toBe(1);
    expect(report.capabilities.transport).toBe("AVAILABLE");
  });

  it("错误信息导出前脱敏", async () => {
    const report = await collect_diagnostics({
      errors: [{ code: "AUTH", message: "token=leaked-value", trace_id: "conn-1" }],
    });
    expect(report.errors[0].message).not.toContain("leaked-value");
    expect(report.errors[0].trace_id).toBe("conn-1");
  });
});