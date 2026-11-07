import type { credential_provider } from "../credential";

export function create_tauri_credential(): credential_provider {
  async function read(credential_ref: string): Promise<string | null> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<string | null>("read_credential", { credentialRef: credential_ref });
  }

  return {
    async save(credential_ref: string, secret: string): Promise<void> {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("save_credential", { credentialRef: credential_ref, secret });
    },
    async read(credential_ref: string): Promise<string | null> {
      return read(credential_ref);
    },
    async delete(credential_ref: string): Promise<void> {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("delete_credential", { credentialRef: credential_ref });
    },
    async exists(credential_ref: string): Promise<boolean> {
      return (await read(credential_ref)) !== null;
    },
  };
}