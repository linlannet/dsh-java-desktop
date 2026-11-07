import { storage_get, storage_remove } from "./storage";
import { create_local_profile, type ConnectionProfile } from "./connection";
import { save_connection } from "./connection_store";

const LEGACY_PORT_KEY = "dsh-agent-port";
const LEGACY_URL_KEY = "dsh-server-url";
const LEGACY_MOBILE_KEY = "dsh-mobile-server";

/**
 * 旧版 mobile 配置迁移：把历史端口/地址转为 ConnectionProfile。
 * 找不到旧配置时返回 null（不产生副作用）；迁移成功后清理旧键。
 */
export function migrate_legacy_connection(): ConnectionProfile | null {
  const port_raw = storage_get(LEGACY_PORT_KEY);
  const url_raw = storage_get(LEGACY_URL_KEY) ?? storage_get(LEGACY_MOBILE_KEY);

  if (!port_raw && !url_raw) return null;

  let port = 8090;
  if (port_raw && /^\d+$/.test(port_raw)) {
    port = Number(port_raw);
  } else if (url_raw) {
    try {
      port = Number(new URL(url_raw).port || 8090);
    } catch {
      return null;
    }
  }

  const profile = create_local_profile(port, {
    id: `legacy:${port}`,
    name: "旧版连接",
    last_status: "unknown",
  });

  const result = save_connection(profile);
  if (!result.ok) return null;

  storage_remove(LEGACY_PORT_KEY);
  storage_remove(LEGACY_URL_KEY);
  storage_remove(LEGACY_MOBILE_KEY);

  return profile;
}