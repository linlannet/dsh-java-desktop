export type transport_kind = "browser" | "tauri" | "harmony";

export type response_type = "text" | "json" | "stream" | "blob" | "arraybuffer";

export interface transport_request {
  url: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: BodyInit | null;
  signal?: AbortSignal;
  mode?: RequestMode;
  timeout_ms?: number;
  response_type?: response_type;
}

export type transport_response = Response;

export interface stream_handle {
  response: Response;
  cancel(): void;
  token: string;
}

export interface transport {
  readonly kind: transport_kind;
  request(req: transport_request): Promise<Response>;
  stream(req: transport_request): Promise<stream_handle>;
  cancel(token: string): void;
  set_credential(auth_ref: string | null): void;
}

export function new_token(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

let current_transport: transport | null = null;

export function get_transport(): transport {
  if (!current_transport) {
    throw new Error("transport 未初始化：宿主必须在启动时注册具体实现");
  }
  return current_transport;
}

export function set_transport(impl: transport): void {
  current_transport = impl;
}