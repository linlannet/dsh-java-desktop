const memory = new Map<string, string>();

let available: boolean | null = null;

function ensure_available(): boolean {
  if (available !== null) return available;
  try {
    const probe_key = "__dsh_storage_probe__";
    window.localStorage.setItem(probe_key, "1");
    window.localStorage.removeItem(probe_key);
    available = true;
  } catch {
    available = false;
  }
  return available;
}

export function storage_available(): boolean {
  return ensure_available();
}

export function storage_get(key: string): string | null {
  if (ensure_available()) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      available = false;
    }
  }
  return memory.get(key) ?? null;
}

export function storage_set(key: string, value: string): void {
  if (ensure_available()) {
    try {
      window.localStorage.setItem(key, value);
      return;
    } catch {
      available = false;
    }
  }
  memory.set(key, value);
}

export function storage_remove(key: string): void {
  if (ensure_available()) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      available = false;
    }
  }
  memory.delete(key);
}

export function storage_clear(): void {
  if (ensure_available()) {
    try {
      window.localStorage.clear();
    } catch {
      available = false;
    }
  }
  memory.clear();
}