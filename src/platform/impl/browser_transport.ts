import { new_token, type stream_handle, type transport, type transport_request } from "../transport";

function to_init(req: transport_request): RequestInit {
  return {
    method: req.method ?? "GET",
    headers: req.headers,
    body: req.body ?? undefined,
    signal: req.signal,
    mode: req.mode,
    credentials: "omit",
  };
}

function timeout_signal(req: transport_request): { signal?: AbortSignal; clear: () => void } {
  if (!req.timeout_ms || req.signal) {
    return { signal: req.signal, clear: () => undefined };
  }
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException("timeout", "TimeoutError")),
    req.timeout_ms,
  );
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

export function create_browser_transport(): transport {
  const controllers = new Map<string, AbortController>();

  return {
    kind: "browser",
    async request(req: transport_request): Promise<Response> {
      const { signal, clear } = timeout_signal(req);
      try {
        return await window.fetch(req.url, { ...to_init(req), signal });
      } finally {
        clear();
      }
    },
    async stream(req: transport_request): Promise<stream_handle> {
      const controller = new AbortController();
      const token = new_token();
      controllers.set(token, controller);
      const response = await window.fetch(req.url, {
        ...to_init(req),
        signal: controller.signal,
      });
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
      // 浏览器实现不持有凭据；鉴权头由 http.ts 的凭据钩子注入请求头。
    },
  };
}