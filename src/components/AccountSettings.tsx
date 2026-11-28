import { useEffect, useRef, useState } from "react";
import {
  clearEmisTicket,
  emisLogout,
  loadEmisConfig,
  loadEmisIdentity,
  pendingEmisTicket,
  pollEmisTicket,
  saveEmisConfig,
  startEmisLogin,
  type EmisIdentity,
} from "../lib/emis-oidc";

/**
 * 企业身份登录面板（设置 → 系统 → EMIS登录）。
 *
 * 身份由 linlan-emis 统一签发，dsh-java 后端走 OIDC 授权码 + PKCE + JWKS 验签，
 * token 只保存在宿主 HttpSession；本面板只保存展示用身份（不含 token），
 * 并控制底部账号入口是否显示。
 */

const ROLE_OPTIONS = [
  { value: 0, label: "0 · 主任（超管）" },
  { value: 1, label: "1 · 管理员" },
  { value: 2, label: "2 · 普通用户" },
  { value: 3, label: "3 · 访客" },
];

function roleLabel(level?: number | null) {
  const found = ROLE_OPTIONS.find((option) => option.value === level);
  return found ? found.label : level == null ? "未设置" : String(level);
}

function notifyAuthChanged() {
  window.dispatchEvent(new Event("dsh-auth-changed"));
}

export default function AccountSettings() {
  const [enabled, setEnabled] = useState(() => loadEmisConfig().enabled);
  const [user, setUser] = useState<EmisIdentity | null>(() => loadEmisIdentity());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const pollingRef = useRef(false);

  // 页面重新聚焦时（用户在浏览器完成登录后切回），若存在待处理 ticket 则自动取回身份
  useEffect(() => {
    const onFocus = () => {
      const ticket = pendingEmisTicket();
      if (!ticket || pollingRef.current) return;
      void (async () => {
        pollingRef.current = true;
        setBusy(true);
        setMessage({ kind: "ok", text: "检测到进行中的企业登录，正在同步身份…" });
        try {
          const identity = await pollEmisTicket(ticket, { timeoutMs: 8_000, intervalMs: 800 });
          if (identity) {
            setUser(identity);
            notifyAuthChanged();
            setMessage({ kind: "ok", text: `登录成功：${identity.userName} · ${roleLabel(identity.roleLevel)}` });
          }
        } finally {
          clearEmisTicket();
          pollingRef.current = false;
          setBusy(false);
        }
      })();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const doSave = () => {
    saveEmisConfig(enabled);
    notifyAuthChanged();
    setMessage({ kind: "ok", text: "登录入口配置已保存" });
  };

  const doLogin = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      // 先保存开关，再发起浏览器登录
      saveEmisConfig(true);
      setEnabled(true);
      const ticket = await startEmisLogin();
      setMessage({
        kind: "ok",
        text: "已在系统浏览器打开企业身份登录页。完成授权后回到此窗口（或任意界面）即可自动同步身份；如未自动同步，请点击「刷新身份」。",
      });
      // 浏览器登录后用户可能停留在浏览器：本窗口可见时后台持续轮询 ticket
      const identity = await pollEmisTicket(ticket, {
        timeoutMs: 180_000,
        intervalMs: 1_500,
        onTick: (left) => {
          if (left > 0 && left % 30_000 < 1_500) {
            setMessage({ kind: "ok", text: `等待浏览器完成企业身份登录…（剩余 ${Math.ceil(left / 1000)} 秒）` });
          }
        },
      });
      clearEmisTicket();
      if (identity) {
        setUser(identity);
        notifyAuthChanged();
        setMessage({ kind: "ok", text: `登录成功：${identity.userName} · ${roleLabel(identity.roleLevel)}` });
      } else {
        setMessage({ kind: "err", text: "等待登录超时。请确认浏览器已完成授权，或重试。" });
      }
    } catch (e) {
      setMessage({ kind: "err", text: `发起登录失败：${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  const doRefresh = async () => {
    if (busy) return;
    const ticket = pendingEmisTicket();
    if (!ticket) {
      setMessage({ kind: "err", text: "没有进行中的登录。请先点击「使用企业账号登录」。" });
      return;
    }
    setBusy(true);
    try {
      const identity = await pollEmisTicket(ticket, { timeoutMs: 15_000, intervalMs: 700 });
      clearEmisTicket();
      if (identity) {
        setUser(identity);
        notifyAuthChanged();
        setMessage({ kind: "ok", text: `身份已刷新：${identity.userName} · ${roleLabel(identity.roleLevel)}` });
      } else {
        setMessage({ kind: "err", text: "尚未获取到登录身份，请在浏览器完成授权后重试。" });
      }
    } finally {
      setBusy(false);
    }
  };

  const doLogout = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await emisLogout();
      setUser(null);
      notifyAuthChanged();
      setMessage({ kind: "ok", text: "已退出登录（登录入口配置保留）" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="set-section-label">企业身份登录</div>
      <section className="set-card">
        <p className="account-hint">
          身份由 <strong>linlan-emis（BuddyOne）</strong> 统一管理：浏览器跳转 OIDC 授权（PKCE），
          RS256 令牌只保存在宿主会话，桌面端仅保存展示用身份、不接触 token。
        </p>
        <div className="form-grid">
          <label className="form-field inline-check">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            <span>开启登录入口（开启后底部显示账号入口：未登录可登录，已登录显示当前人员；关闭则隐藏）</span>
          </label>
        </div>
        <div className="account-actions">
          <button type="button" className="ghost-action compact" onClick={doSave}>保存配置</button>
          <button type="button" className="primary-action compact" onClick={() => void doLogin()} disabled={busy}>
            {busy ? "处理中…" : "使用企业账号登录"}
          </button>
          <button type="button" className="ghost-action compact" onClick={() => void doRefresh()} disabled={busy}>
            刷新身份
          </button>
        </div>
        {message ? <div className={message.kind === "ok" ? "account-msg ok" : "account-msg err"}>{message.text}</div> : null}
      </section>

      {user ? (
        <>
          <div className="set-section-label">当前登录</div>
          <section className="set-card">
            <div className="set-row">
              <div className="set-row-main">
                <strong>{user.nickName ? `${user.nickName}（${user.userName}）` : user.userName}</strong>
                <span>
                  来源：企业身份（OIDC）
                  {user.tenantId != null ? ` · 租户 ${user.tenantId}` : ""}
                  {Array.isArray(user.scopes) && user.scopes.length ? ` · scope: ${user.scopes.join(" ")}` : ""}
                </span>
              </div>
              <span className="set-chip live">{roleLabel(user.roleLevel)}</span>
            </div>
            <div className="account-actions">
              <button type="button" className="ghost-action compact" onClick={() => void doLogout()} disabled={busy}>退出登录</button>
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
