export interface app_info_capability {
  version(): Promise<string>;
}

export interface update_info {
  version: string;
}

export interface update_capability {
  check(): Promise<update_info | null>;
}

export interface lifecycle_capability {
  close_window(): Promise<void>;
  on_focus_changed(handler: (focused: boolean) => void): Promise<() => void>;
}

export interface native_capability {
  invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T>;
  app_info: app_info_capability;
  update: update_capability;
  lifecycle: lifecycle_capability;
}

let native_promise: Promise<native_capability> | null = null;

async function ensure_native(): Promise<native_capability> {
  if (!native_promise) {
    native_promise = (async () => {
      const is_tauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
      if (is_tauri) {
        const { create_tauri_native } = await import("./impl/tauri_native");
        return create_tauri_native();
      }
      const { create_browser_native } = await import("./impl/browser_native");
      return create_browser_native();
    })();
  }
  return native_promise;
}

export async function native_invoke<T = unknown>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  return (await ensure_native()).invoke<T>(command, args);
}

export async function app_version(): Promise<string> {
  return (await ensure_native()).app_info.version();
}

export async function update_check(): Promise<update_info | null> {
  return (await ensure_native()).update.check();
}

export const lifecycle: lifecycle_capability = {
  async close_window(): Promise<void> {
    return (await ensure_native()).lifecycle.close_window();
  },
  async on_focus_changed(handler: (focused: boolean) => void): Promise<() => void> {
    return (await ensure_native()).lifecycle.on_focus_changed(handler);
  },
};