import type { CapabilityResult } from "./result";
import type { stream_handle, transport_request } from "./transport";

export interface file_handle {
  name: string;
  path: string;
  size: number;
  mime: string;
}

export interface file_stat {
  size: number;
  mtime_ms: number;
}

export interface dir_entry {
  name: string;
  path: string;
  kind: "file" | "directory";
}

export interface network_state {
  online: boolean;
  type: "wifi" | "cellular" | "ethernet" | "unknown";
}

export interface git_branch_state {
  current: string;
  branches: string[];
}

export interface git_change_summary {
  changed_files: number;
  additions: number;
  deletions: number;
}

export interface deeplink_target {
  route: string;
  params: Record<string, string>;
}

export type device_permission_state = "granted" | "denied" | "prompt" | "unsupported";

/** transport：网络传输；默认超时 15s；stream 返回 token 可 cancel。 */
export interface transport_capability {
  request(req: transport_request): Promise<CapabilityResult<Response>>;
  stream(req: transport_request): Promise<CapabilityResult<stream_handle>>;
  cancel(token: string): void;
}

/** credential：安全存储；只暴露引用，不返回明文到非宿主层之外。 */
export interface credential_capability {
  save(credential_ref: string, secret: string): Promise<CapabilityResult<void>>;
  read(credential_ref: string): Promise<CapabilityResult<string | null>>;
  delete(credential_ref: string): Promise<CapabilityResult<void>>;
  exists(credential_ref: string): Promise<CapabilityResult<boolean>>;
}

/** file：本地文件；pick 用户取消返回 CANCELLED。 */
export interface file_capability {
  pick(options?: { accept?: string[]; multiple?: boolean }): Promise<CapabilityResult<file_handle[]>>;
  read_text(path: string): Promise<CapabilityResult<string>>;
  read_binary(path: string): Promise<CapabilityResult<{ base64: string; mime: string }>>;
  write_text(path: string, content: string): Promise<CapabilityResult<void>>;
  stat(path: string): Promise<CapabilityResult<file_stat>>;
  list_dir(path: string, show_hidden?: boolean): Promise<CapabilityResult<dir_entry[]>>;
  export(path: string, suggested_name?: string): Promise<CapabilityResult<{ exported_path: string }>>;
}

/** export_share：系统分享；失败降级复制链接。 */
export interface export_share_capability {
  share_open(payload: { text?: string; url?: string; file_path?: string }): Promise<CapabilityResult<void>>;
}

/** external_open：外部打开；open_file/reveal 在移动端可能 UNAVAILABLE。 */
export interface external_open_capability {
  open_url(url: string): Promise<CapabilityResult<void>>;
  open_file(path: string): Promise<CapabilityResult<void>>;
  reveal(path: string): Promise<CapabilityResult<void>>;
}

/** notify：本地通知；permission 返回授权状态。 */
export interface notify_capability {
  send(payload: { title: string; body: string }): Promise<CapabilityResult<void>>;
  permission(): Promise<CapabilityResult<device_permission_state>>;
}

/** clipboard：剪贴板读写。 */
export interface clipboard_capability {
  write(text: string): Promise<CapabilityResult<void>>;
  read(): Promise<CapabilityResult<string>>;
}

/** network：网络状态与变化订阅。 */
export interface network_capability {
  status(): Promise<CapabilityResult<network_state>>;
  on_change(handler: (state: network_state) => void): Promise<CapabilityResult<() => void>>;
}

/** app_info：应用与壳版本。 */
export interface app_info_capability {
  version(): Promise<CapabilityResult<string>>;
}

/** update：更新检查；移动端跳应用商店，因此可能返回 null。 */
export interface update_capability {
  check(): Promise<CapabilityResult<{ version: string } | null>>;
}

/** lifecycle：前后台事件，返回取消订阅函数。 */
export interface lifecycle_capability {
  on_foreground(handler: () => void): Promise<CapabilityResult<() => void>>;
  on_background(handler: () => void): Promise<CapabilityResult<() => void>>;
}

/** deeplink：深链解析与打开事件。 */
export interface deeplink_capability {
  on_open(handler: (target: deeplink_target) => void): Promise<CapabilityResult<() => void>>;
  parse(url: string): Promise<CapabilityResult<deeplink_target>>;
}

/** git：桌面/云侧可用；移动端通常 UNAVAILABLE。 */
export interface git_capability {
  branch(path: string): Promise<CapabilityResult<string>>;
  branches(path: string): Promise<CapabilityResult<git_branch_state>>;
  switch_branch(path: string, branch: string): Promise<CapabilityResult<git_branch_state>>;
  changes(path: string): Promise<CapabilityResult<git_change_summary>>;
  diff(path: string, file_path: string): Promise<CapabilityResult<string>>;
}

/** diagnostics：诊断导出，必须脱敏。 */
export interface diagnostics_capability {
  export(): Promise<CapabilityResult<{ text: string }>>;
}

/** storage：本地偏好/草稿；凭据禁止使用。 */
export interface storage_capability {
  get(key: string): Promise<CapabilityResult<string | null>>;
  set(key: string, value: string): Promise<CapabilityResult<void>>;
  remove(key: string): Promise<CapabilityResult<void>>;
  clear(): Promise<CapabilityResult<void>>;
}

export interface platform_contract {
  transport: transport_capability;
  credential: credential_capability;
  file: file_capability;
  export_share: export_share_capability;
  external_open: external_open_capability;
  notify: notify_capability;
  clipboard: clipboard_capability;
  network: network_capability;
  app_info: app_info_capability;
  update: update_capability;
  lifecycle: lifecycle_capability;
  deeplink: deeplink_capability;
  git: git_capability;
  diagnostics: diagnostics_capability;
  storage: storage_capability;
}

export const capability_domains = [
  "transport",
  "credential",
  "file",
  "export_share",
  "external_open",
  "notify",
  "clipboard",
  "network",
  "app_info",
  "update",
  "lifecycle",
  "deeplink",
  "git",
  "diagnostics",
  "storage",
] as const satisfies readonly (keyof platform_contract)[];