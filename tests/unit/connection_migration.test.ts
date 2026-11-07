import { beforeEach, describe, expect, it } from "vitest";
import { migrate_legacy_connection } from "../../src/platform/connection_migration";
import { list_connections } from "../../src/platform/connection_store";
import { storage_clear, storage_get, storage_set } from "../../src/platform/storage";

describe("legacy connection migration", () => {
  beforeEach(() => {
    storage_clear();
  });

  it("无旧配置时返回 null 且不写入", () => {
    expect(migrate_legacy_connection()).toBeNull();
    expect(list_connections()).toHaveLength(0);
  });

  it("旧端口迁移为连接配置并清理旧键", () => {
    storage_set("dsh-agent-port", "8090");
    const profile = migrate_legacy_connection();
    expect(profile?.base_url).toBe("http://127.0.0.1:8090");
    expect(profile?.name).toBe("旧版连接");
    expect(storage_get("dsh-agent-port")).toBeNull();
    expect(list_connections()).toHaveLength(1);
  });

  it("旧 URL 迁移提取端口", () => {
    storage_set("dsh-server-url", "http://127.0.0.1:9000");
    const profile = migrate_legacy_connection();
    expect(profile?.base_url).toBe("http://127.0.0.1:9000");
    expect(storage_get("dsh-server-url")).toBeNull();
  });

  it("非法旧 URL 不产生配置", () => {
    storage_set("dsh-server-url", "not-a-url");
    expect(migrate_legacy_connection()).toBeNull();
    expect(list_connections()).toHaveLength(0);
  });
});