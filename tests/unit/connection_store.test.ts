import { beforeEach, describe, expect, it } from "vitest";
import { create_local_profile } from "../../src/platform/connection";
import {
  get_active_connection_id,
  get_connection,
  list_connections,
  remove_connection,
  save_connection,
  set_active_connection_id,
} from "../../src/platform/connection_store";
import { storage_clear } from "../../src/platform/storage";

describe("connection store", () => {
  beforeEach(() => {
    storage_clear();
  });

  it("保存并读取连接配置", () => {
    const profile = create_local_profile(8090);
    expect(save_connection(profile).ok).toBe(true);
    expect(list_connections()).toHaveLength(1);
    expect(get_connection(profile.id)?.base_url).toBe(profile.base_url);
  });

  it("非法配置拒绝保存", () => {
    const result = save_connection({ ...create_local_profile(8090), name: "" });
    expect(result.ok).toBe(false);
    expect(list_connections()).toHaveLength(0);
  });

  it("同一 id 更新不重复", () => {
    const profile = create_local_profile(8090);
    save_connection(profile);
    save_connection({ ...profile, name: "改名后" });
    expect(list_connections()).toHaveLength(1);
    expect(get_connection(profile.id)?.name).toBe("改名后");
  });

  it("删除后清理激活项", () => {
    const profile = create_local_profile(8090);
    save_connection(profile);
    set_active_connection_id(profile.id);
    remove_connection(profile.id);
    expect(list_connections()).toHaveLength(0);
    expect(get_active_connection_id()).toBeNull();
  });

  it("两个配置互相隔离", () => {
    save_connection(create_local_profile(8090));
    save_connection({ ...create_local_profile(8091), id: "remote-1", name: "远端" });
    expect(list_connections()).toHaveLength(2);
    expect(get_connection("remote-1")?.name).toBe("远端");
  });
});