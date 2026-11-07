import { describe, expect, it } from "vitest";
import {
  ProtocolError,
  error_from_exception,
  error_from_status,
  is_protocol_error_kind,
} from "../../src/platform/result";

describe("protocol error mapping", () => {
  it("401 映射为 AUTH", () => {
    expect(error_from_status(401).kind).toBe("AUTH");
  });

  it("403 映射为 FORBIDDEN", () => {
    expect(error_from_status(403).kind).toBe("FORBIDDEN");
  });

  it("404 映射为 NOT_FOUND", () => {
    expect(error_from_status(404).kind).toBe("NOT_FOUND");
  });

  it("500 映射为 SERVER", () => {
    expect(error_from_status(500).kind).toBe("SERVER");
  });

  it("超时映射为 TIMEOUT", () => {
    const error = error_from_exception(new DOMException("timeout", "TimeoutError"));
    expect(error.kind).toBe("TIMEOUT");
  });

  it("断网 TypeError 映射为 NETWORK", () => {
    const error = error_from_exception(new TypeError("Failed to fetch"));
    expect(error.kind).toBe("NETWORK");
  });

  it("保留服务端 info 作为可展示原因", () => {
    expect(error_from_status(401, "密钥无效").message).toBe("密钥无效");
  });

  it("ProtocolError 原样返回", () => {
    const original = new ProtocolError("CONTRACT", "契约不符");
    expect(error_from_exception(original)).toBe(original);
  });

  it("类型判定可用", () => {
    expect(is_protocol_error_kind(error_from_status(403), "FORBIDDEN")).toBe(true);
    expect(is_protocol_error_kind(error_from_status(403), "AUTH")).toBe(false);
  });
});