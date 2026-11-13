import { useState } from "react";
import { storage_get, storage_remove, storage_set } from "../platform/storage";
import { httpFetch } from "../lib/http";

/**
 * 个人登录设置面板（系统分组）。
 * 可配置登录 URI / 用户名 / 密码 / 角色 roleLevel；
 * 支持测试验证（只校验凭据）、模拟登录（跳过服务器建本机会话）、真实登录；
 * 已登录可退出登录、注销用户（调 DELETE {uri}/api/user/{id}，需 roleLevel=0）。
 */

/** 登录配置（本机持久化；含密码便于联调，注意设备安全） */
type AuthConfig = { uri: string; userName: string; password: string; roleLevel: number; enabled: boolean };

/** 登录会话（与侧边栏底部账号入口共用 dsh-auth-user） */
type AuthUser = {
  userName: string;
  nickName?: string;
  avatarUrl?: string;
  token?: string;
  userId?: number | null;
  roleLevel?: number | null;
  tenantId?: number | null;
  source?: "real" | "mock";
};

const CONFIG_KEY = "dsh-auth-config";
const USER_KEY = "dsh-auth-user";

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

function loadConfig(): AuthConfig {
  try {
    const raw = storage_get(CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AuthConfig>;
      return {
        uri: parsed.uri ?? "",
        userName: parsed.userName ?? "",
        password: parsed.password ?? "",
        roleLevel: typeof parsed.roleLevel === "number" ? parsed.roleLevel : 2,
        enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : false,
      };
    }
  } catch {
    // 忽略损坏的本地配置
  }
  return { uri: "", userName: "", password: "", roleLevel: 2, enabled: false };
}

function loadUser(): AuthUser | null {
  try {
    const raw = storage_get(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

/** 兼容 Result{data:{token,userInfo}} 与裸对象两种返回包装 */
function parseLoginPayload(payload: unknown, fallbackName: string): AuthUser {
  const root = (payload ?? {}) as Record<string, any>;
  const data = root.data ?? root;
  const u = data.userInfo ?? data.user ?? data;
  return {
    userName: u.userName ?? fallbackName,
    nickName: u.nickName ?? u.nick_name ?? "",
    avatarUrl: u.avatarUrl ?? u.avatar_url ?? "",
    token: data.token ?? u.token ?? "",
    userId: u.userId ?? u.user_id ?? null,
    roleLevel: u.roleLevel ?? u.role_level ?? null,
    tenantId: u.tenantId ?? u.tenant_id ?? null,
    source: "real",
  };
}

function notifyAuthChanged() {
  window.dispatchEvent(new Event("dsh-auth-changed"));
}

export default function AccountSettings() {
  const [config, setConfig] = useState<AuthConfig>(() => loadConfig());
  const [user, setUser] = useState<AuthUser | null>(() => loadUser());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const update = (patch: Partial<AuthConfig>) => setConfig((current) => ({ ...current, ...patch }));
  const baseUri = () => config.uri.trim().replace(/\/+$/, "");

  const saveConfig = () => {
    storage_set(CONFIG_KEY, JSON.stringify(config));
    window.dispatchEvent(new Event("dsh-auth-changed"));
    setMessage({ kind: "ok", text: "登录配置已保存到本机" });
  };

  const requestLogin = async (): Promise<AuthUser> => {
    if (!config.userName.trim()) throw new Error("请先填写用户名");
    if (!config.password) throw new Error("请先填写密码");
    const resp = await httpFetch(`${baseUri()}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userName: config.userName.trim(), password: config.password }),
    });
    const payload = await resp.json().catch(() => null);
    if (!resp.ok) {
      throw new Error(payload?.message ?? payload?.msg ?? `登录失败（${resp.status}）`);
    }
    return parseLoginPayload(payload, config.userName.trim());
  };

  const doTest = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const next = await requestLogin();
      storage_set(CONFIG_KEY, JSON.stringify(config));
      window.dispatchEvent(new Event("dsh-auth-changed"));
      setMessage({ kind: "ok", text: `验证通过：${next.userName} · ${roleLabel(next.roleLevel)}` });
    } catch (e) {
      setMessage({ kind: "err", text: `验证失败：${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  const doLogin = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const next = await requestLogin();
      storage_set(CONFIG_KEY, JSON.stringify(config));
      storage_set(USER_KEY, JSON.stringify(next));
      setUser(next);
      notifyAuthChanged();
      setMessage({ kind: "ok", text: `登录成功：${next.userName} · ${roleLabel(next.roleLevel)}` });
    } catch (e) {
      setMessage({ kind: "err", text: `登录失败：${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  const doMockLogin = () => {
    if (!config.userName.trim()) {
      setMessage({ kind: "err", text: "请先填写用户名" });
      return;
    }
    storage_set(CONFIG_KEY, JSON.stringify(config));
    window.dispatchEvent(new Event("dsh-auth-changed"));
    const mockUser: AuthUser = {
      userName: config.userName.trim(),
      nickName: "",
      avatarUrl: "",
      token: `mock-${Date.now()}`,
      userId: null,
      roleLevel: config.roleLevel,
      tenantId: null,
      source: "mock",
    };
    storage_set(USER_KEY, JSON.stringify(mockUser));
    setUser(mockUser);
    notifyAuthChanged();
    setMessage({ kind: "ok", text: `模拟登录成功：${mockUser.userName} · ${roleLabel(config.roleLevel)}（未请求服务器）` });
  };

  const logout = () => {
    storage_remove(USER_KEY);
    setUser(null);
    notifyAuthChanged();
    setMessage({ kind: "ok", text: "已退出登录（登录配置保留）" });
  };

  const unregister = async () => {
    if (!user) return;
    const confirmed = window.confirm(
      `确定注销用户「${user.nickName || user.userName}」吗？将尝试删除服务端账号并清除本机登录态。`,
    );
    if (!confirmed) return;
    let note: string;
    if (user.source !== "mock" && user.token && user.userId != null) {
      try {
        const resp = await httpFetch(`${baseUri()}/api/auth/user/${user.userId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${user.token}` },
        });
        const payload = await resp.json().catch(() => null);
        note = resp.ok
          ? "服务端账号已删除"
          : `服务端注销未成功（${resp.status}${payload?.message ? "：" + payload.message : ""}）`;
      } catch (e) {
        note = `服务端不可达（${e instanceof Error ? e.message : String(e)}）`;
      }
    } else {
      note = user.source === "mock" ? "模拟账号仅存在于本机" : "缺少 userId 或 token，跳过服务端注销";
    }
    storage_remove(USER_KEY);
    setUser(null);
    notifyAuthChanged();
    setMessage({ kind: note.includes("已删除") ? "ok" : "err", text: `注销完成：${note}；本机登录态已清除` });
  };

  return (
    <>
      {user ? (
        <>
          <div className="set-section-label">当前登录</div>
          <section className="set-card">
            <div className="set-row">
              <div className="set-row-main">
                <strong>{user.nickName ? `${user.nickName}（${user.userName}）` : user.userName}</strong>
                <span>
                  来源：{user.source === "mock" ? "模拟登录（本机会话）" : "服务端登录"}
                  {user.tenantId != null ? ` · 租户 ${user.tenantId}` : ""}
                </span>
              </div>
              <span className={`set-chip ${user.source === "mock" ? "" : "live"}`}>{roleLabel(user.roleLevel)}</span>
            </div>
            <div className="account-actions">
              <button type="button" className="ghost-action compact" onClick={logout}>退出登录</button>
              <button type="button" className="danger-action compact" onClick={() => void unregister()}>注销用户</button>
            </div>
          </section>
        </>
      ) : null}

      <div className="set-section-label">登录配置</div>
      <section className="set-card">
        <div className="form-grid">
          <label className="form-field span-2">
            <span>登录 URI</span>
            <input
              value={config.uri}
              placeholder="http://127.0.0.1:8080（留空则走同源 /api/auth/login）"
              onChange={(event) => update({ uri: event.target.value })}
            />
          </label>
          <label className="form-field">
            <span>用户名 userName</span>
            <input
              value={config.userName}
              placeholder="userName"
              onChange={(event) => update({ userName: event.target.value })}
            />
          </label>
          <label className="form-field">
            <span>密码 password</span>
            <input
              type="password"
              value={config.password}
              placeholder="password"
              onChange={(event) => update({ password: event.target.value })}
            />
          </label>
          <label className="form-field">
            <span>角色 roleLevel</span>
            <select value={String(config.roleLevel)} onChange={(event) => update({ roleLevel: Number(event.target.value) })}>
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={String(option.value)}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="form-field inline-check">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(event) => update({ enabled: event.target.checked })}
            />
            <span>开启登录入口（在侧边栏底部「设置」旁显示登录按钮；需同时填写登录 URI）</span>
          </label>
        </div>
        <div className="account-actions">
          <button type="button" className="ghost-action compact" onClick={saveConfig}>保存配置</button>
          <button type="button" className="ghost-action compact" onClick={() => void doTest()} disabled={busy}>
            {busy ? "验证中…" : "测试验证"}
          </button>
          <button type="button" className="ghost-action compact" onClick={doMockLogin} disabled={busy}>模拟登录</button>
          <button type="button" className="primary-action compact" onClick={() => void doLogin()} disabled={busy}>
            {busy ? "登录中…" : "登录"}
          </button>
        </div>
        {message ? <div className={message.kind === "ok" ? "account-msg ok" : "account-msg err"}>{message.text}</div> : null}
        <p className="account-hint">
          测试验证只校验凭据，不生成本机会话；模拟登录跳过服务器，直接以所选角色建立本机会话（token 以 mock- 开头）；
          注销用户会调用 DELETE {"{uri}"}/api/auth/user/{"{id}"} 删除服务端账号（需 roleLevel=0）。
        </p>
      </section>
    </>
  );
}
