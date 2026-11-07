import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { create_browser_transport } from "../../src/platform/impl/browser_transport";
import { create_browser_native } from "../../src/platform/impl/browser_native";
import { probe_capabilities } from "../../src/platform/capabilities";

describe("h5 smoke", () => {
  it("浏览器传输实现可用", () => {
    expect(create_browser_transport().kind).toBe("browser");
  });

  it("浏览器原生能力降级不抛未捕获异常", async () => {
    const native = create_browser_native();
    expect(await native.app_info.version()).toBe("web");
    expect(await native.update.check()).toBeNull();
    await expect(native.invoke("open_external")).rejects.toThrow();
  });

  it("浏览器能力表：transport AVAILABLE / credential DEGRADED / git UNAVAILABLE", async () => {
    const caps = await probe_capabilities();
    expect(caps.transport).toBe("AVAILABLE");
    expect(caps.credential).toBe("DEGRADED");
    expect(caps.git).toBe("UNAVAILABLE");
  });

  it("dist 入口存在且无绝对路径引用", () => {
    const index = readFileSync("dist/index.html", "utf8");
    expect(index).not.toMatch(/(?:src|href)="\/(?!\/)/);
  });
});