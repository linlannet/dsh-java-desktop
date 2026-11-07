import { storage_get, storage_set, storage_remove } from "./storage";
import { validate_connection, type ConnectionProfile } from "./connection";

const CONNECTIONS_KEY = "dsh-connections";
const ACTIVE_KEY = "dsh-active-connection";

function parse_list(raw: string | null): ConnectionProfile[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is ConnectionProfile =>
      Boolean(item) && typeof (item as ConnectionProfile).id === "string",
    );
  } catch {
    return [];
  }
}

export function list_connections(): ConnectionProfile[] {
  return parse_list(storage_get(CONNECTIONS_KEY));
}

export function get_connection(id: string): ConnectionProfile | null {
  return list_connections().find((item) => item.id === id) ?? null;
}

export function save_connection(profile: ConnectionProfile): { ok: boolean; error?: string } {
  const result = validate_connection(profile);
  if (!result.ok) return { ok: false, error: result.error };

  const items = list_connections();
  const index = items.findIndex((item) => item.id === profile.id);
  if (index >= 0) items[index] = profile;
  else items.push(profile);

  storage_set(CONNECTIONS_KEY, JSON.stringify(items));
  return { ok: true };
}

export function remove_connection(id: string): void {
  const items = list_connections().filter((item) => item.id !== id);
  storage_set(CONNECTIONS_KEY, JSON.stringify(items));
  if (get_active_connection_id() === id) {
    storage_remove(ACTIVE_KEY);
  }
}

export function get_active_connection_id(): string | null {
  return storage_get(ACTIVE_KEY);
}

export function set_active_connection_id(id: string | null): void {
  if (id) storage_set(ACTIVE_KEY, id);
  else storage_remove(ACTIVE_KEY);
}