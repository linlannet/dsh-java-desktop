import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpFetch } from "../../src/lib/http";

vi.mock("../../src/lib/http", () => ({
  httpFetch: vi.fn(),
}));

import {
  create_pairing_code,
  list_devices,
  pair_device,
  read_mobile_access,
  write_mobile_access,
} from "../../src/lib/device_pairing";

const mocked_fetch = vi.mocked(httpFetch);

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("device pairing client", () => {
  beforeEach(() => {
    mocked_fetch.mockReset();
  });

  it("配对成功返回设备凭据", async () => {
    mocked_fetch.mockResolvedValue(
      reply({
        code: "00000",
        info: "success",
        data: { deviceId: "dev-1", deviceName: "手机", token: "devt_x", issuedAt: "2026-11-06T00:00:00Z" },
      }),
    );

    const result = await pair_device({
      base_url: "http://192.168.1.10:8090",
      pairing_code: "123456",
      device_name: "手机",
    });

    expect(result.deviceId).toBe("dev-1");
    expect(result.token).toBe("devt_x");
    expect(mocked_fetch).toHaveBeenCalledTimes(1);
  });

  it("配对码过期时抛出服务端原因", async () => {
    mocked_fetch.mockResolvedValue(reply({ code: "40002", info: "配对码已过期", data: null }));

    await expect(
      pair_device({ base_url: "http://127.0.0.1:8090", pairing_code: "000000", device_name: "手机" }),
    ).rejects.toThrow("配对码已过期");
  });

  it("读取移动访问开关", async () => {
    mocked_fetch.mockResolvedValue(reply({ code: "00000", info: "success", data: true }));
    await expect(read_mobile_access("http://127.0.0.1:8090")).resolves.toBe(true);
  });

  it("写入移动访问开关携带 enabled", async () => {
    mocked_fetch.mockResolvedValue(reply({ code: "00000", info: "success", data: false }));
    await write_mobile_access("http://127.0.0.1:8090", false);

    const [, init] = mocked_fetch.mock.calls[0];
    expect(init?.method).toBe("PUT");
    expect(init?.body).toBe(JSON.stringify({ enabled: false }));
  });

  it("生成配对码返回 6 位与过期时间", async () => {
    mocked_fetch.mockResolvedValue(
      reply({
        code: "00000",
        info: "success",
        data: { pairingCode: "123456", expiresAt: "2026-11-06T00:10:00Z", expiresInSeconds: 600 },
      }),
    );

    const code = await create_pairing_code("http://127.0.0.1:8090");
    expect(code.pairingCode).toHaveLength(6);
    expect(code.expiresInSeconds).toBe(600);
  });

  it("设备列表为空时返回空数组", async () => {
    mocked_fetch.mockResolvedValue(reply({ code: "00000", info: "success", data: [] }));
    await expect(list_devices("http://127.0.0.1:8090")).resolves.toEqual([]);
  });

  it("HTTP 非 200 时抛出错误", async () => {
    mocked_fetch.mockResolvedValue(reply({ code: "50000", info: "服务异常" }, 500));
    await expect(list_devices("http://127.0.0.1:8090")).rejects.toThrow("服务异常");
  });
});