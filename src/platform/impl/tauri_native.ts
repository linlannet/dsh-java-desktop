import type { lifecycle_capability, native_capability, update_capability } from "../native";

async function invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauri_invoke } = await import("@tauri-apps/api/core");
  return tauri_invoke<T>(command, args);
}

const update: update_capability = {
  async check() {
    const { check } = await import("@tauri-apps/plugin-updater");
    const result = await check();
    return result ? { version: result.version } : null;
  },
};

const lifecycle: lifecycle_capability = {
  async close_window(): Promise<void> {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().close();
  },
  async on_focus_changed(handler: (focused: boolean) => void): Promise<() => void> {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return getCurrentWindow().onFocusChanged(({ payload }) => handler(Boolean(payload)));
  },
};

export function create_tauri_native(): native_capability {
  return {
    invoke,
    app_info: {
      async version(): Promise<string> {
        const { getVersion } = await import("@tauri-apps/api/app");
        return getVersion();
      },
    },
    update,
    lifecycle,
  };
}