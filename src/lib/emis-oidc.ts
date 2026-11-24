import { native_invoke } from "../platform/native";
import { connection_base_url } from "../platform/connection";
import { storage_get, storage_remove, storage_set } from "../platform/storage";
import { credential_delete, credential_read, credential_save } from "../platform/credential";
import { httpFetch } from "./http";
import type { AgentServiceState } from "../types";

/**
 * 企业身份登录（linlan-emis OIDC）桌面端客户端。
 *
 * 链路（不依赖 deep-link、不依赖 WebView 读浏览器 cookie）：
 *   1. 桌面端生成一次性 ticket（32 字节随机 Base64URL），打开系统浏览器访问
 *      {base}/api/emis/login?return=/bridge.html&ticket=<ticket>
 *   2. dsh-java 后端完成授权码 + PKCE + JWKS 验签，把身份挂到 ticket，回跳 /bridge.html
 *   3. 桌面端轮询 {base}/api/emis/ticket?ticket=<ticket>，一次性取回身份（不含 token）
 *
 * token 只保存在后端 HttpSession；前端 localStorage 仅存展示用身份，不落 token。
 */

export type EmisIdentity = {
  userId?: number | null;
  tenantId?: number | null;
  roleLevel?: number | null;
  userName: string;
  /** 兼容旧数据 / 未来扩展；OIDC 当前不返回这两项 */
  nickName?: string;
  avatarUrl?: string;
  scopes?: string[];
  issuer?: string;
  expiresAt?: number;
  source?: "emis";
};

export const EMIS_USER_KEY = "dsh-auth-user";
export const EMIS_CONFIG_KEY = "dsh-auth-config";
const EMIS_TICKET_KEY = "dsh-emis-login-ticket";
/** Tauri 安全凭据中的会话引用键（真实串存 0600 文件，不在 localStorage） */
const EMIS_SESSION_CREDENTIAL_REF = "DSH_EMIS_SESSION";

export type EmisConfig = { enabled: boolean };

export function loadEmisConfig(): EmisConfig {
  try {
    const raw = storage_get(EMIS_CONFIG_KEY);
    if (!raw) return { enabled: false };
    const parsed = JSON.parse(raw) as { enabled?: boolean };
    return { enabled: Boolean(parsed.enabled) };
  } catch {
    return { enabled: false };
  }
}

export function saveEmisConfig(enabled: boolean): void {
  storage_set(EMIS_CONFIG_KEY, JSON.stringify({ enabled }));
}

export function loadEmisIdentity(): EmisIdentity | null {
  try {
    const raw = storage_get(EMIS_USER_KEY);
    return raw ? (JSON.parse(raw) as EmisIdentity) : null;
  } catch {
    return null;
  }
}

export function saveEmisIdentity(identity: EmisIdentity | null): void {
  if (!identity) {
    storage_remove(EMIS_USER_KEY);
    return;
  }
  const safe = { ...identity, source: "emis" as const };
  delete (safe as Record<string, unknown>).token;
  storage_set(EMIS_USER_KEY, JSON.stringify(safe));
}

/** 取当前 dsh-java 后端 base URL（端口来自 Rust agent_status，不硬编码 8090）。 */
export async function harnessBaseUrl(): Promise<string> {
  const state = await native_invoke<AgentServiceState>("agent_status");
  if (!state?.port) throw new Error("智能体服务未运行，无法确定后端地址");
  return connection_base_url(state.port);
}

function randomTicket(): string {
  const bytes = new Uint8Array(32);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * 发起企业身份登录：生成 ticket、在系统浏览器打开授权页。
 * 返回 ticket，由调用方启动轮询。
 */
export async function startEmisLogin(): Promise<string> {
  const base = (await harnessBaseUrl()).replace(/\/+$/, "");
  const ticket = randomTicket();
  storage_set(EMIS_TICKET_KEY, ticket);
  const url = `${base}/api/emis/login?return=${encodeURIComponent("/bridge.html")}&ticket=${encodeURIComponent(ticket)}`;
  await native_invoke("open_external", { url });
  return ticket;
}

/** 轮询 ticket，成功后写入本地身份并返回；超时返回 null。 */
export async function pollEmisTicket(
  ticket: string,
  options: { timeoutMs?: number; intervalMs?: number; onTick?: (leftMs: number) => void } = {},
): Promise<EmisIdentity | null> {
  const base = (await harnessBaseUrl()).replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? 120_000;
  const intervalMs = options.intervalMs ?? 1_500;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const resp = await httpFetch(`${base}/api/emis/ticket?ticket=${encodeURIComponent(ticket)}`);
      const payload = await resp.json().catch(() => null);
      if (resp.ok && payload?.code === "00000" && payload?.data) {
        const result = payload.data as { identity: EmisIdentity; session?: string };
        const identity = result.identity ?? (result as unknown as EmisIdentity);
        saveEmisIdentity(identity);
        // 跨重启：把后端签发的会话凭据写入 Tauri 0600 安全文件
        if (result.session) {
          try { await credential_save(EMIS_SESSION_CREDENTIAL_REF, result.session); } catch { /* 凭据写入失败不影响本次登录 */ }
        }
        return identity;
      }
    } catch {
      // 服务暂时不可达：继续轮询
    }
    options.onTick?.(Math.max(0, deadline - Date.now()));
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}

/**
 * 跨重启恢复：从 Tauri 安全凭据读出 session，向后端验签换取身份。
 * 返回 null 表示未登录 / 凭据失效 / 后端不可达（均由调用方按未登录处理）。
 */
export async function restoreEmisSession(): Promise<EmisIdentity | null> {
  let session: string | null = null;
  try { session = await credential_read(EMIS_SESSION_CREDENTIAL_REF); } catch { return null; }
  if (!session || !session.trim()) return null;
  try {
    const base = (await harnessBaseUrl()).replace(/\/+$/, "");
    const resp = await httpFetch(`${base}/api/emis/session?session=${encodeURIComponent(session.trim())}`);
    const payload = await resp.json().catch(() => null);
    if (resp.ok && payload?.code === "00000" && payload?.data) {
      const identity = payload.data as EmisIdentity;
      saveEmisIdentity(identity);
      return identity;
    }
    // 凭据过期/无效：清除
    if (payload?.code === "40100") {
      await credential_delete(EMIS_SESSION_CREDENTIAL_REF).catch(() => {});
      saveEmisIdentity(null);
    }
    return null;
  } catch {
    return null;
  }
}

/** 退出登录：调用后端失效 HttpSession，并清本地身份、票据与持久化会话凭据。 */
export async function emisLogout(): Promise<void> {
  try {
    const base = (await harnessBaseUrl()).replace(/\/+$/, "");
    await httpFetch(`${base}/api/emis/logout`, { method: "POST" });
  } catch {
    // 后端不可达也要清本地登录态
  }
  saveEmisIdentity(null);
  clearEmisTicket();
  try { await credential_delete(EMIS_SESSION_CREDENTIAL_REF); } catch { /* ignore */ }
}

/**
 * 定时清理：校验持久化 session 是否仍有效，失效（过期/篡改/密钥轮换）则删除凭据与本地身份。
 * 由 App 层每隔一段时间调用；与后端 /session 的 40100 处理配合完成过期项回收。
 */
export async function cleanupExpiredEmisSession(): Promise<void> {
  let session: string | null = null;
  try { session = await credential_read(EMIS_SESSION_CREDENTIAL_REF); } catch { return; }
  if (!session || !session.trim()) return;
  let valid = false;
  try {
    const base = (await harnessBaseUrl()).replace(/\/+$/, "");
    const resp = await httpFetch(`${base}/api/emis/session?session=${encodeURIComponent(session.trim())}`);
    const payload = await resp.json().catch(() => null);
    valid = Boolean(resp.ok && payload?.code === "00000" && payload?.data);
  } catch {
    return; // 后端不可达时不清凭据，避免网络抖动导致误删
  }
  if (!valid) {
    try { await credential_delete(EMIS_SESSION_CREDENTIAL_REF); } catch { /* ignore */ }
    saveEmisIdentity(null);
    window.dispatchEvent(new Event("dsh-auth-changed"));
  }
}

export function clearEmisTicket(): void {
  const raw = storage_get(EMIS_TICKET_KEY);
  if (raw) storage_set(EMIS_TICKET_KEY, "");
}

export function pendingEmisTicket(): string | null {
  const raw = storage_get(EMIS_TICKET_KEY);
  return raw && raw.trim() ? raw.trim() : null;
}
