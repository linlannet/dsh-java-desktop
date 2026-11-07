export interface harmony_bridge {
  invoke(request: string): string;
  getVersion(): number;
}

declare global {
  interface Window {
    dshBridge?: harmony_bridge;
  }
}

export interface bridge_reply {
  id: string;
  ok: boolean;
  data: string | null;
  code: string;
}

export function harmony_available(): boolean {
  return typeof window !== "undefined" && typeof window.dshBridge?.invoke === "function";
}

export function harmony_bridge_version(): number | null {
  if (!harmony_available()) return null;
  try {
    return window.dshBridge?.getVersion() ?? null;
  } catch {
    return null;
  }
}

export async function harmony_call<T = unknown>(
  method: string,
  args: unknown,
  timeout_ms = 15_000,
): Promise<T> {
  const bridge = typeof window !== "undefined" ? window.dshBridge : undefined;
  if (!bridge) throw new Error("dshBridge 未注入");

  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const request = JSON.stringify({ id, method, args: JSON.stringify(args ?? {}) });

  const reply = await new Promise<bridge_reply>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("BRIDGE_TIMEOUT")), timeout_ms);
    try {
      const raw = bridge.invoke(request);
      clearTimeout(timer);
      resolve(JSON.parse(raw) as bridge_reply);
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });

  if (!reply.ok) throw new Error(reply.code || "BRIDGE_ERROR");
  return (reply.data ? JSON.parse(reply.data) : null) as T;
}