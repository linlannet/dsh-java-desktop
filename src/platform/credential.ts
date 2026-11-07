export interface credential_provider {
  save(credential_ref: string, secret: string): Promise<void>;
  read(credential_ref: string): Promise<string | null>;
  delete(credential_ref: string): Promise<void>;
  exists(credential_ref: string): Promise<boolean>;
}

let provider_promise: Promise<credential_provider> | null = null;

async function ensure_provider(): Promise<credential_provider> {
  if (!provider_promise) {
    provider_promise = (async () => {
      const is_tauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
      if (is_tauri) {
        const { create_tauri_credential } = await import("./impl/tauri_credential");
        return create_tauri_credential();
      }
      const { create_memory_credential } = await import("./impl/memory_credential");
      return create_memory_credential();
    })();
  }
  return provider_promise;
}

export async function credential_save(credential_ref: string, secret: string): Promise<void> {
  return (await ensure_provider()).save(credential_ref, secret);
}

export async function credential_read(credential_ref: string): Promise<string | null> {
  return (await ensure_provider()).read(credential_ref);
}

export async function credential_delete(credential_ref: string): Promise<void> {
  return (await ensure_provider()).delete(credential_ref);
}

export async function credential_exists(credential_ref: string): Promise<boolean> {
  return (await ensure_provider()).exists(credential_ref);
}