import { capability_error_of, type CapabilityResult } from "./result";

/**
 * 扫码能力契约。
 *
 * 具体实现（Android CameraX+MLKit / iOS AVFoundation / 鸿蒙 ScanKit）
 * 在 9.4 / 9.5 选型落地后接入；当前未接入时统一返回 UNSUPPORTED，
 * 调用方必须保留手输短码路径。
 */
export interface scanner_capability {
  scan_pairing_code(): Promise<CapabilityResult<string>>;
}

export function unsupported_scanner(reason = "扫码能力尚未接入"): scanner_capability {
  return {
    async scan_pairing_code(): Promise<CapabilityResult<string>> {
      return capability_error_of("UNSUPPORTED", "SCANNER_UNSUPPORTED", reason);
    },
  };
}

let current_scanner: scanner_capability = unsupported_scanner();

export function set_scanner(impl: scanner_capability): void {
  current_scanner = impl;
}

export function get_scanner(): scanner_capability {
  return current_scanner;
}

export async function scan_pairing_code(): Promise<CapabilityResult<string>> {
  return current_scanner.scan_pairing_code();
}