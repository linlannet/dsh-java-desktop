import { describe, expect, it } from "vitest";
import {
  capability_error_of,
  capability_ok,
  is_cancelled,
  with_capability_timeout,
} from "../../src/platform/result";

describe("capability result model", () => {
  it("成功返回 OK", async () => {
    const result = await with_capability_timeout(Promise.resolve("ok"), 100);
    expect(result.state).toBe("OK");
    expect(result.state === "OK" && result.data).toBe("ok");
  });

  it("超时返回 FAILED 且 code=TIMEOUT", async () => {
    const result = await with_capability_timeout(new Promise(() => undefined), 10);
    expect(result.state).toBe("FAILED");
    expect(result.state !== "OK" && result.error.code).toBe("TIMEOUT");
  });

  it("用户取消返回 CANCELLED，可与超时区分", async () => {
    const result = await with_capability_timeout(
      Promise.reject(new DOMException("aborted", "AbortError")),
      100,
    );
    expect(result.state).toBe("CANCELLED");
    expect(is_cancelled(result)).toBe(true);
  });

  it("UNSUPPORTED / DENIED 可表达", () => {
    expect(capability_error_of("UNSUPPORTED", "UNSUPPORTED", "当前宿主不支持").state).toBe(
      "UNSUPPORTED",
    );
    expect(capability_error_of("DENIED", "DENIED", "用户拒绝授权").state).toBe("DENIED");
  });

  it("capability_ok 包装数据", () => {
    const result = capability_ok({ value: 1 });
    expect(result.state === "OK" && result.data.value).toBe(1);
  });
});