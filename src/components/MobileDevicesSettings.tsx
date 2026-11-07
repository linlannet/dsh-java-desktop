import { useCallback, useEffect, useState } from "react";
import {
  create_pairing_code,
  list_devices,
  read_mobile_access,
  revoke_device,
  rotate_device,
  write_mobile_access,
  type device_view,
  type pairing_code,
} from "../lib/device_pairing";

export default function MobileDevicesSettings({ servicePort }: { servicePort: number | null }) {
  const base_url = servicePort ? `http://127.0.0.1:${servicePort}` : "";
  const [enabled, set_enabled] = useState(false);
  const [devices, set_devices] = useState<device_view[]>([]);
  const [code, set_code] = useState<pairing_code | null>(null);
  const [remaining, set_remaining] = useState(0);
  const [busy, set_busy] = useState(false);
  const [error, set_error] = useState("");

  const refresh = useCallback(async () => {
    if (!base_url) return;
    try {
      const [access, list] = await Promise.all([
        read_mobile_access(base_url),
        list_devices(base_url),
      ]);
      set_enabled(Boolean(access));
      set_devices(list ?? []);
      set_error("");
    } catch (cause) {
      set_error(cause instanceof Error ? cause.message : "读取移动设备状态失败");
    }
  }, [base_url]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!code) return;
    const update = () => {
      const left = Math.max(0, Math.round((new Date(code.expiresAt).getTime() - Date.now()) / 1000));
      set_remaining(left);
      if (left <= 0) set_code(null);
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [code]);

  const toggle_access = async () => {
    if (!base_url) return;
    set_busy(true);
    try {
      const next = await write_mobile_access(base_url, !enabled);
      set_enabled(Boolean(next));
      if (!next) set_code(null);
      set_error("");
    } catch (cause) {
      set_error(cause instanceof Error ? cause.message : "切换失败");
    } finally {
      set_busy(false);
    }
  };

  const generate_code = async () => {
    if (!base_url) return;
    set_busy(true);
    try {
      set_code(await create_pairing_code(base_url));
      set_error("");
    } catch (cause) {
      set_error(cause instanceof Error ? cause.message : "生成配对码失败");
    } finally {
      set_busy(false);
    }
  };

  const remove_device = async (device_id: string) => {
    if (!base_url) return;
    if (!window.confirm("吊销后该设备需重新配对，确定继续？")) return;
    try {
      await revoke_device(base_url, device_id);
      await refresh();
    } catch (cause) {
      set_error(cause instanceof Error ? cause.message : "吊销失败");
    }
  };

  const rotate = async (device_id: string) => {
    if (!base_url) return;
    try {
      const result = await rotate_device(base_url, device_id);
      window.alert(`新凭据已签发，请在该设备上重新输入：${result.token.slice(0, 12)}…`);
      await refresh();
    } catch (cause) {
      set_error(cause instanceof Error ? cause.message : "轮换失败");
    }
  };

  return (
    <div className="set-section">
      <div className="set-section-label">移动设备访问</div>
      <section className="set-card">
        <div className="set-card-row">
          <div>
            <div className="set-card-title">允许移动设备连接</div>
            <div className="set-card-desc">
              默认关闭。开启后可在手机端输入配对码连接本机 Agent；如需局域网访问，请以
              <code> --server.address=0.0.0.0 </code>
              启动服务。
            </div>
          </div>
          <button
            type="button"
            className={`settings-mode-tab${enabled ? " active" : ""}`}
            disabled={busy || !base_url}
            onClick={toggle_access}
            style={{ minWidth: 88 }}
          >
            {enabled ? "已开启" : "已关闭"}
          </button>
        </div>
      </section>

      <div className="set-section-label">配对码</div>
      <section className="set-card">
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <button
            type="button"
            className="settings-pill"
            disabled={busy || !enabled || !base_url}
            onClick={generate_code}
            style={{ border: 0, cursor: enabled ? "pointer" : "not-allowed" }}
          >
            生成配对码
          </button>
          {code ? (
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <strong style={{ fontSize: 28, letterSpacing: ".18em", fontFamily: "monospace" }}>
                {code.pairingCode}
              </strong>
              <span style={{ color: "var(--text-subtle)", fontSize: 12 }}>
                {remaining > 0 ? `${remaining}s 后过期` : "已过期"}
              </span>
            </div>
          ) : (
            <span style={{ color: "var(--text-subtle)", fontSize: 12 }}>
              {enabled ? "生成后 10 分钟内有效，仅可使用一次" : "请先开启移动设备访问"}
            </span>
          )}
        </div>
      </section>

      <div className="set-section-label">已配对设备</div>
      <section className="set-card">
        {devices.length === 0 ? (
          <div style={{ color: "var(--text-subtle)", fontSize: 12 }}>暂无已配对设备</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: "var(--text-subtle)", textAlign: "left" }}>
                <th style={{ padding: "6px 0" }}>设备</th>
                <th>指纹</th>
                <th>配对时间</th>
                <th style={{ textAlign: "right" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => (
                <tr key={device.deviceId} style={{ borderTop: "1px solid var(--hairline)" }}>
                  <td style={{ padding: "8px 0" }}>{device.deviceName}</td>
                  <td style={{ fontFamily: "monospace", color: "var(--text-muted)" }}>
                    {device.fingerprint.slice(0, 8)}…
                  </td>
                  <td style={{ color: "var(--text-muted)" }}>{device.createdAt.slice(0, 19)}</td>
                  <td style={{ textAlign: "right" }}>
                    <button type="button" className="session-action-btn" title="轮换凭据" onClick={() => rotate(device.deviceId)}>
                      ↻
                    </button>
                    <button type="button" className="session-action-btn danger" title="吊销设备" onClick={() => remove_device(device.deviceId)}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {error ? <p style={{ color: "var(--danger)", fontSize: 12 }}>{error}</p> : null}
    </div>
  );
}