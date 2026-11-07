import { useState } from "react";
import { pair_device, type device_pair_result } from "../lib/device_pairing";
import { credential_save } from "../platform/credential";
import { scan_pairing_code } from "../platform/scanner";

export default function ConnectionSetupView({
  base_url,
  on_paired,
}: {
  base_url: string;
  on_paired: (result: device_pair_result) => void;
}) {
  const [server_url, set_server_url] = useState(base_url);
  const [pairing_code, set_pairing_code] = useState("");
  const [device_name, set_device_name] = useState("我的手机");
  const [status, set_status] = useState<"idle" | "pairing" | "error" | "done">("idle");
  const [error, set_error] = useState("");
  const [scanning, set_scanning] = useState(false);

  const scan = async () => {
    set_scanning(true);
    try {
      const result = await scan_pairing_code();
      if (result.state === "OK") {
        set_pairing_code(result.data.replace(/\D/g, "").slice(0, 6));
        set_status("idle");
        set_error("");
      } else {
        set_error(
          result.state === "UNSUPPORTED"
            ? "当前设备暂不支持扫码，请手动输入配对码"
            : result.error.message,
        );
        set_status("error");
      }
    } finally {
      set_scanning(false);
    }
  };

  const submit = async () => {
    if (!server_url.trim()) {
      set_error("请输入桌面端服务地址");
      set_status("error");
      return;
    }
    if (!pairing_code.trim()) {
      set_error("请输入配对码");
      set_status("error");
      return;
    }
    set_status("pairing");
    set_error("");
    try {
      const result = await pair_device({
        base_url: server_url.trim(),
        pairing_code,
        device_name: device_name.trim() || "我的手机",
      });
      try {
        await credential_save(`device:${result.deviceId}`, result.token);
      } catch {
        set_error("配对成功，但设备凭据写入安全存储失败，请重试或检查系统钥匙串权限");
        set_status("error");
        return;
      }
      set_status("done");
      on_paired(result);
    } catch (cause) {
      set_status("error");
      set_error(cause instanceof Error ? cause.message : "配对失败");
    }
  };

  return (
    <div className="connection-setup" style={{ padding: 16, maxWidth: 420 }}>
      <h3 style={{ marginTop: 0 }}>连接桌面端</h3>
      <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
        在桌面端「设置 → 系统 → 移动设备」开启访问并生成 6 位配对码，10 分钟内有效且只能使用一次。
      </p>

      <label style={{ display: "block", marginBottom: 12 }}>
        <span style={{ display: "block", fontSize: 12, marginBottom: 4 }}>桌面端地址</span>
        <input
          value={server_url}
          onChange={(event) => set_server_url(event.target.value)}
          placeholder="http://192.168.1.10:8090"
          style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid var(--border)" }}
        />
      </label>

      <label style={{ display: "block", marginBottom: 12 }}>
        <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
          配对码
          <button
            type="button"
            onClick={scan}
            disabled={scanning}
            style={{ border: 0, background: "transparent", color: "var(--accent)", fontSize: 12, cursor: "pointer" }}
          >
            {scanning ? "扫码中…" : "扫码"}
          </button>
        </span>
        <input
          value={pairing_code}
          onChange={(event) => set_pairing_code(event.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          maxLength={6}
          placeholder="6 位数字"
          style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid var(--border)" }}
        />
      </label>

      <label style={{ display: "block", marginBottom: 12 }}>
        <span style={{ display: "block", fontSize: 12, marginBottom: 4 }}>设备名称</span>
        <input
          value={device_name}
          onChange={(event) => set_device_name(event.target.value)}
          maxLength={40}
          style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid var(--border)" }}
        />
      </label>

      {status === "error" && (
        <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>
      )}
      {status === "done" && (
        <p style={{ color: "var(--success)", fontSize: 13 }}>配对成功，凭据已写入安全存储。</p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={status === "pairing"}
        style={{
          width: "100%",
          minHeight: "var(--touch-min)",
          borderRadius: 10,
          border: 0,
          background: "var(--accent)",
          color: "var(--accent-text)",
          cursor: "pointer",
        }}
      >
        {status === "pairing" ? "配对中…" : "配对"}
      </button>

      <p style={{ color: "var(--text-subtle)", fontSize: 12, marginTop: 12 }}>
        扫码不可用时仍可手动输入 6 位短码完成配对。
      </p>
    </div>
  );
}