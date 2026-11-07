import type { native_capability } from "../native";

export function create_browser_native(): native_capability {
  return {
    async invoke<T = unknown>(): Promise<T> {
      throw new Error("当前宿主不支持原生能力");
    },
    app_info: {
      async version(): Promise<string> {
        return "web";
      },
    },
    update: {
      async check() {
        return null;
      },
    },
    lifecycle: {
      async close_window(): Promise<void> {
        // 浏览器无窗口句柄，忽略。
      },
      async on_focus_changed(): Promise<() => void> {
        return () => undefined;
      },
    },
  };
}