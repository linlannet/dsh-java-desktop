export type connection_channel = "LOCAL" | "HTTPS" | "SSH" | "RELAY";

export type auth_mode = "NONE" | "API_KEY" | "DEVICE" | "PAIRING_CODE";

export type connection_status = "unknown" | "online" | "offline" | "unauthorized" | "incompatible";

export interface ConnectionProfile {
  id: string;
  name: string;
  channel: connection_channel;
  base_url: string;
  auth_mode: auth_mode;
  credential_ref: string | null;
  last_status: connection_status;
  last_used_at: string | null;
}

export const connection_channels: readonly connection_channel[] = ["LOCAL", "HTTPS", "SSH", "RELAY"];

export const auth_modes: readonly auth_mode[] = ["NONE", "API_KEY", "DEVICE", "PAIRING_CODE"];

const statuses: readonly connection_status[] = [
  "unknown",
  "online",
  "offline",
  "unauthorized",
  "incompatible",
];

const credential_ref_pattern = /^[A-Za-z0-9._:-]{1,128}$/;

export interface validation_result {
  ok: boolean;
  error?: string;
}

function is_loopback(hostname: string): boolean {
  return (
    hostname === "127.0.0.1" ||
    hostname === "localhost" ||
    hostname === "[::1]" ||
    hostname === "::1"
  );
}

function is_lan(hostname: string): boolean {
  return (
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  );
}

export interface connection_options {
  allow_lan_plaintext?: boolean;
}

export function validate_connection(
  profile: Partial<ConnectionProfile>,
  options: connection_options = {},
): validation_result {
  const name = profile.name?.trim() ?? "";
  if (name.length < 1 || name.length > 40) {
    return { ok: false, error: "名称长度必须为 1–40 字符" };
  }

  const channel = profile.channel;
  if (!channel || !connection_channels.includes(channel)) {
    return { ok: false, error: "通道必须是 LOCAL / HTTPS / SSH / RELAY" };
  }

  if (!profile.base_url) {
    return { ok: false, error: "base_url 不能为空" };
  }

  let url: URL;
  try {
    url = new URL(profile.base_url);
  } catch {
    return { ok: false, error: "base_url 不是合法 URL" };
  }

  if (channel === "HTTPS" && url.protocol !== "https:") {
    return { ok: false, error: "HTTPS 通道必须使用 https://" };
  }

  if (channel === "LOCAL" && !is_loopback(url.hostname)) {
    return { ok: false, error: "LOCAL 通道必须指向回环地址" };
  }

  if (channel !== "LOCAL" && url.protocol === "http:") {
    if (!(options.allow_lan_plaintext === true && is_lan(url.hostname))) {
      return { ok: false, error: "非回环地址必须使用 https://（局域网明文需显式确认）" };
    }
  }

  if (profile.auth_mode && !auth_modes.includes(profile.auth_mode)) {
    return { ok: false, error: "auth_mode 非法" };
  }

  if (profile.last_status && !statuses.includes(profile.last_status)) {
    return { ok: false, error: "last_status 非法" };
  }

  if (profile.credential_ref != null) {
    if (
      typeof profile.credential_ref !== "string" ||
      !credential_ref_pattern.test(profile.credential_ref)
    ) {
      return { ok: false, error: "credential_ref 只能保存引用标识，不得写入明文密钥" };
    }
  }

  return { ok: true };
}

export function create_local_profile(
  port: number,
  overrides: Partial<ConnectionProfile> = {},
): ConnectionProfile {
  return {
    id: `local:${port}`,
    name: "本机",
    channel: "LOCAL",
    base_url: `http://127.0.0.1:${port}`,
    auth_mode: "API_KEY",
    credential_ref: null,
    last_status: "unknown",
    last_used_at: null,
    ...overrides,
  };
}

export function connection_base_url(target: number | ConnectionProfile): string {
  return typeof target === "number" ? create_local_profile(target).base_url : target.base_url;
}

export function is_local_host(hostname: string): boolean {
  return is_loopback(hostname);
}