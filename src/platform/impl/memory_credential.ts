import type { credential_provider } from "../credential";

export function create_memory_credential(): credential_provider {
  const store = new Map<string, string>();

  return {
    async save(credential_ref: string, secret: string): Promise<void> {
      store.set(credential_ref, secret);
    },
    async read(credential_ref: string): Promise<string | null> {
      return store.get(credential_ref) ?? null;
    },
    async delete(credential_ref: string): Promise<void> {
      store.delete(credential_ref);
    },
    async exists(credential_ref: string): Promise<boolean> {
      return store.has(credential_ref);
    },
  };
}