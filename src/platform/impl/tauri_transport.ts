import { fetch as plugin_fetch } from "@tauri-apps/plugin-http";
import {
  new_token,
  type stream_handle,
  type transport,
  type transport_request,
} from "../transport";

const NATIVE_RETRY_MS = 60_000;
const native_blocked_origins = new Map<string, number>();

function to_init(req: transport_request): RequestInit {
  return {
    method: req.method ?? "GET",
    headers: req.headers,
    body: req.body ?? undefined,
    signal: req.signal,
    mode: req.mode,
  };
}

function origin_of(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

/**
 * 双通道：优先原生 window.fetch，失败回退 Tauri plugin-http。
 * 按源记住原生失败时间，60 秒内同源请求直接走插件通道，超时后重试原生。
 */
async function native_or_plugin(req: transport_request): Promise<Response> {
  const init = to_init(req);
  const origin = origin_of(req.url);
  const blocked_at = origin ? native_blocked_origins.get(origin) : undefined;
  const native_allowed =
    !origin || blocked_at === undefined || Date.now() - blocked_at > NATIVE_RETRY_MS;
  if (native_allowed) {
    try {
      return await window.fetch(req.url, init);
    } catch (error) {
      if (!origin) throw error;
      native_blocked_origins.set(origin, Date.now());
    }
  }
  return (await plugin_fetch(req.url, init)) as unknown as Response;
}

export function create_tauri_transport(): transport {
  const controllers = new Map<string, AbortController>();

  return {
    kind: "tauri",
    request(req: transport_request): Promise<Response> {
      return native_or_plugin(req);
    },
    async stream(req: transport_request): Promise<stream_handle> {
      const controller = new AbortController();
      const token = new_token();
      controllers.set(token, controller);
      const response = await native_or_plugin({ ...req, signal: controller.signal });
      return {
        response,
        token,
        cancel: () => {
          controller.abort();
          controllers.delete(token);
        },
      };
    },
    cancel(token: string): void {
      controllers.get(token)?.abort();
      controllers.delete(token);
    },
    set_credential(): void {
      // 鉴权头由 http.ts 的凭据钩子注入请求头。
    },
  };
}