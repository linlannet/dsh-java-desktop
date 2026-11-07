export interface ApiEnvelope<T> {
  code: string;
  info: string;
  data: T;
}

export type protocol_error_kind =
  | "AUTH"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "SERVER"
  | "TIMEOUT"
  | "NETWORK"
  | "CONTRACT"
  | "ABORTED";

export class ProtocolError extends Error {
  readonly kind: protocol_error_kind;
  readonly status?: number;
  readonly info: string;

  constructor(kind: protocol_error_kind, message: string, options?: { status?: number }) {
    super(message);
    this.name = "ProtocolError";
    this.kind = kind;
    this.info = message;
    this.status = options?.status;
  }
}

export function error_from_status(status: number, info?: string | null): ProtocolError {
  const message = info || `请求失败：HTTP ${status}`;
  if (status === 401) return new ProtocolError("AUTH", message, { status });
  if (status === 403) return new ProtocolError("FORBIDDEN", message, { status });
  if (status === 404) return new ProtocolError("NOT_FOUND", message, { status });
  if (status >= 500) return new ProtocolError("SERVER", message, { status });
  return new ProtocolError("CONTRACT", message, { status });
}

export function error_from_exception(error: unknown): ProtocolError {
  if (error instanceof ProtocolError) return error;
  if (error instanceof DOMException) {
    if (error.name === "TimeoutError") return new ProtocolError("TIMEOUT", "请求超时");
    if (error.name === "AbortError") return new ProtocolError("ABORTED", "请求已取消");
  }
  if (error instanceof Error) {
    if (error.name === "TimeoutError") return new ProtocolError("TIMEOUT", error.message || "请求超时");
    if (error.name === "AbortError") return new ProtocolError("ABORTED", error.message || "请求已取消");
    if (error.message === "请求超时") return new ProtocolError("TIMEOUT", error.message);
    if (error instanceof TypeError) return new ProtocolError("NETWORK", error.message || "网络不可达");
    return new ProtocolError("NETWORK", error.message || "网络异常");
  }
  return new ProtocolError("NETWORK", "网络异常");
}

export function is_protocol_error_kind(error: unknown, kind: protocol_error_kind): boolean {
  return error instanceof ProtocolError && error.kind === kind;
}

export type capability_state = "OK" | "UNSUPPORTED" | "DENIED" | "CANCELLED" | "FAILED";

export interface capability_error {
  code: string;
  message: string;
  diagnostic_id?: string;
}

export type CapabilityResult<T> =
  | { state: "OK"; data: T }
  | { state: "UNSUPPORTED"; error: capability_error }
  | { state: "DENIED"; error: capability_error }
  | { state: "CANCELLED"; error: capability_error }
  | { state: "FAILED"; error: capability_error };

export const DEFAULT_CAPABILITY_TIMEOUT_MS = 15_000;

export function capability_ok<T>(data: T): CapabilityResult<T> {
  return { state: "OK", data };
}

export function capability_error_of(
  state: Exclude<capability_state, "OK">,
  code: string,
  message: string,
  diagnostic_id?: string,
): CapabilityResult<never> {
  return { state, error: { code, message, diagnostic_id } };
}

export function is_cancelled<T>(result: CapabilityResult<T>): boolean {
  return result.state === "CANCELLED";
}

function map_capability_failure(error: unknown): CapabilityResult<never> {
  if (error instanceof DOMException) {
    if (error.name === "AbortError") return capability_error_of("CANCELLED", "CANCELLED", "已取消");
    if (error.name === "TimeoutError") return capability_error_of("FAILED", "TIMEOUT", "能力调用超时");
  }
  if (error instanceof Error && error.message === "请求超时") {
    return capability_error_of("FAILED", "TIMEOUT", "能力调用超时");
  }
  return capability_error_of("FAILED", "FAILED", error instanceof Error ? error.message : "能力调用失败");
}

export function with_capability_timeout<T>(
  promise: Promise<T>,
  timeout_ms: number = DEFAULT_CAPABILITY_TIMEOUT_MS,
): Promise<CapabilityResult<T>> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(capability_error_of("FAILED", "TIMEOUT", "能力调用超时"));
    }, timeout_ms);

    promise.then(
      (data) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(capability_ok(data));
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(map_capability_failure(error));
      },
    );
  });
}