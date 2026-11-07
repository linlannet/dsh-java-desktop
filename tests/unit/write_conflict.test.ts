import { describe, expect, it } from "vitest";
import { conflict_notice, detect_write_conflict } from "../../src/lib/write_conflict";

describe("single-writer conflict", () => {
  it("HTTP 409 判定为冲突", () => {
    expect(detect_write_conflict(409, null).conflict).toBe(true);
  });

  it("业务码 SESSION_BUSY 判定为冲突并保留 info", () => {
    const result = detect_write_conflict(200, { code: "SESSION_BUSY", info: "会话被占用" });
    expect(result.conflict).toBe(true);
    expect(result.message).toBe("会话被占用");
  });

  it("普通成功响应不误判", () => {
    expect(detect_write_conflict(200, { code: "00000", info: "success" }).conflict).toBe(false);
  });

  it("冲突提示引导只读与恢复方式", () => {
    const notice = conflict_notice({ conflict: true, message: "该会话正在其他设备上运行" });
    expect(notice).toContain("只读");
  });

  it("无冲突时无提示", () => {
    expect(conflict_notice({ conflict: false, message: "" })).toBeNull();
  });
});