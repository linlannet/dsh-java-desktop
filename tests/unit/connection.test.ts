import { describe, expect, it } from "vitest";
import { create_local_profile, validate_connection } from "../../src/platform/connection";

const fields = [
  "auth_mode",
  "base_url",
  "channel",
  "credential_ref",
  "id",
  "last_status",
  "last_used_at",
  "name",
];

describe("connection profile", () => {
  it("本地连接对象包含 8 个字段", () => {
    expect(Object.keys(create_local_profile(8090)).sort()).toEqual([...fields].sort());
  });

  it("合法 LOCAL 通过校验", () => {
    expect(validate_connection(create_local_profile(8090)).ok).toBe(true);
  });

  it("LOCAL 指向非回环地址被拒绝", () => {
    const result = validate_connection({
      ...create_local_profile(8090),
      base_url: "http://10.0.0.1:8090",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("回环");
  });

  it("HTTPS 通道必须使用 https://", () => {
    const result = validate_connection({
      ...create_local_profile(8090),
      channel: "HTTPS",
      base_url: "http://example.com",
    });
    expect(result.ok).toBe(false);
  });

  it("空名称被拒绝", () => {
    expect(validate_connection({ ...create_local_profile(8090), name: "   " }).ok).toBe(false);
  });

  it("名称超过 40 字符被拒绝", () => {
    expect(validate_connection({ ...create_local_profile(8090), name: "a".repeat(41) }).ok).toBe(false);
  });

  it("非法 URL 被拒绝", () => {
    expect(validate_connection({ ...create_local_profile(8090), base_url: "not-a-url" }).ok).toBe(false);
  });

  it("credential_ref 含明文空格被拒绝", () => {
    expect(
      validate_connection({ ...create_local_profile(8090), credential_ref: "secret with space" }).ok,
    ).toBe(false);
  });

  it("credential_ref 引用标识通过", () => {
    expect(validate_connection({ ...create_local_profile(8090), credential_ref: "cred-001" }).ok).toBe(true);
  });

  it("公网明文地址被阻断", () => {
    const result = validate_connection({
      ...create_local_profile(8090),
      channel: "RELAY",
      base_url: "http://example.com:8090",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("https");
  });

  it("局域网明文需显式确认", () => {
    const profile = {
      ...create_local_profile(8090),
      channel: "RELAY" as const,
      base_url: "http://192.168.1.10:8090",
    };
    expect(validate_connection(profile).ok).toBe(false);
    expect(validate_connection(profile, { allow_lan_plaintext: true }).ok).toBe(true);
  });
});