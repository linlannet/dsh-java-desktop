import { BRIDGE_VERSION } from "./version";

export type capability_status = "AVAILABLE" | "DEGRADED" | "UNAVAILABLE";

export interface capability_report {
  transport: capability_status;
  credential: capability_status;
  file: capability_status;
  notification: capability_status;
  git: capability_status;
}

export interface capability_entry {
  state: capability_status;
  bridge_version: number;
  host: string;
}

export interface capability_table {
  host: string;
  bridge_version: number;
  entries: Record<keyof capability_report, capability_entry>;
}

function is_tauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function detect_host(): string {
  return is_tauri() ? "desktop" : "browser";
}

export async function probe_capabilities(): Promise<capability_report> {
  if (is_tauri()) {
    return {
      transport: "AVAILABLE",
      credential: "AVAILABLE",
      file: "AVAILABLE",
      notification: "AVAILABLE",
      git: "AVAILABLE",
    };
  }
  return {
    transport: "AVAILABLE",
    credential: "DEGRADED",
    file: "UNAVAILABLE",
    notification: "UNAVAILABLE",
    git: "UNAVAILABLE",
  };
}

export async function capability_table(host: string = detect_host()): Promise<capability_table> {
  const report = await probe_capabilities();
  const entries = Object.fromEntries(
    Object.entries(report).map(([domain, state]) => [
      domain,
      { state, bridge_version: BRIDGE_VERSION, host },
    ]),
  ) as Record<keyof capability_report, capability_entry>;

  return { host, bridge_version: BRIDGE_VERSION, entries };
}