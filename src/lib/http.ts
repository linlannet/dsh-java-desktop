import {
  get_transport,
  set_transport,
  type transport,
  type transport_request,
} from "../platform/transport";
import { is_local_host } from "../platform/connection";

/**
 * 传输选择层：桌面/Tauri 走原生 fetch + plugin-http 回退，纯浏览器走 window.fetch。
 * 具体实现按运行时动态加载，纯浏览器构建不会加载 Tauri 实现。
 */
let transport_promise: Promise<transport> | null = null;

async function ensure_transport(): Promise<transport> {
  if (!transport_promise) {
    transport_promise = (async () => {
      const is_tauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
      if (is_tauri) {
        const { create_tauri_transport } = await import("../platform/impl/tauri_transport");
        set_transport(create_tauri_transport());
      } else {
        const { create_browser_transport } = await import("../platform/impl/browser_transport");
        set_transport(create_browser_transport());
      }
      return get_transport();
    })();
  }
  return transport_promise;
}

/**
 * 本机鉴权 API Key（D-04）：Rust 壳启动 JAR 时随机生成并注入 harness.auth.api-keys，
 * 前端对回环地址的请求统一自动附带 X-API-Key。null = 无鉴权模式（JAR 未启用校验）。
 */
let local_api_key: string | null = null;

export function setLocalApiKey(key: string | null | undefined): void {
  local_api_key = key || null;
}

/** 返回附带本机鉴权头后的 init（供不经 httpFetch 的裸 fetch 调用点复用） */
export function localAuthInit(url: string, init?: RequestInit): RequestInit {
  return with_local_auth(url, init);
}

function with_local_auth(url: string, init?: RequestInit): RequestInit {
  if (!local_api_key) return init ?? {};
  let same_origin_local = false;
  try {
    same_origin_local = is_local_host(new URL(url).hostname);
  } catch {
    same_origin_local = false;
  }
  if (!same_origin_local) return init ?? {};
  return {
    ...init,
    headers: {
      ...init?.headers,
      "X-API-Key": local_api_key,
    },
  };
}

function headers_to_record(headers?: HeadersInit): Record<string, string> | undefined {
  if (!headers) return undefined;
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    const out: Record<string, string> = {};
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return { ...(headers as Record<string, string>) };
}

function to_transport_request(url: string, init?: RequestInit): transport_request {
  return {
    url,
    method: (init?.method as transport_request["method"]) ?? "GET",
    headers: headers_to_record(init?.headers),
    body: (init?.body as BodyInit | null | undefined) ?? undefined,
    signal: init?.signal ?? undefined,
  };
}

export async function httpFetch(url: string, init?: RequestInit): Promise<Response> {
  const impl = await ensure_transport();
  const initWithAuth = with_local_auth(url, init);
  return impl.request(to_transport_request(url, initWithAuth));
}