export const BRIDGE_VERSION = 1;

export const MIN_SUPPORTED_BRIDGE_VERSION = 1;

export const MAX_SUPPORTED_BRIDGE_VERSION = 1;

export const ARTIFACT_VERSION = "0.1.0";

export interface bridge_negotiation {
  supported: boolean;
  required: number;
  host: string;
  bridge_version: number;
}

export function negotiate_bridge(
  required: number,
  host: string,
  version: number = BRIDGE_VERSION,
): bridge_negotiation {
  return {
    supported: version >= required,
    required,
    host,
    bridge_version: version,
  };
}

export interface artifact_descriptor {
  artifact_version: string;
  contract_version: number;
  min_bridge_version: number;
  content_hash: string;
}

export type artifact_compat_reason = "BRIDGE_TOO_OLD" | "ARTIFACT_TOO_OLD";

export interface artifact_compat {
  compatible: boolean;
  reason?: artifact_compat_reason;
  message?: string;
}

export function check_artifact_compat(
  descriptor: Pick<artifact_descriptor, "min_bridge_version">,
  bridge_version: number = BRIDGE_VERSION,
): artifact_compat {
  if (descriptor.min_bridge_version > bridge_version) {
    return { compatible: false, reason: "BRIDGE_TOO_OLD", message: "请升级应用" };
  }
  return { compatible: true };
}