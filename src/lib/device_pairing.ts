import { httpFetch } from "./http";
import { storage_get, storage_set } from "../platform/storage";

export interface device_pair_result {
  deviceId: string;
  deviceName: string;
  token: string;
  issuedAt: string;
}

export interface device_pair_request {
  base_url: string;
  pairing_code: string;
  device_name: string;
}

const FINGERPRINT_KEY = "dsh-device-fingerprint";

export function device_fingerprint(): string {
  const existing = storage_get(FINGERPRINT_KEY);
  if (existing) return existing;
  const generated =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  storage_set(FINGERPRINT_KEY, generated);
  return generated;
}

export async function pair_device(request: device_pair_request): Promise<device_pair_result> {
  const base_url = request.base_url.replace(/\/+$/, "");
  const response = await httpFetch(`${base_url}/api/devices/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pairingCode: request.pairing_code.trim(),
      deviceName: request.device_name.trim(),
      fingerprint: device_fingerprint(),
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { code?: string; info?: string; data?: device_pair_result }
    | null;

  if (!response.ok || payload?.code !== "00000" || !payload?.data) {
    throw new Error(payload?.info || `配对失败：HTTP ${response.status}`);
  }

  return payload.data;
}

export interface pairing_code {
  pairingCode: string;
  expiresAt: string;
  expiresInSeconds: number;
}

export interface device_view {
  deviceId: string;
  deviceName: string;
  fingerprint: string;
  createdAt: string;
  lastSeenAt: string;
}

async function request<T>(base_url: string, path: string, init?: RequestInit): Promise<T> {
  const response = await httpFetch(`${base_url.replace(/\/+$/, "")}${path}`, init);
  const payload = (await response.json().catch(() => null)) as
    | { code?: string; info?: string; data?: T }
    | null;
  if (!response.ok || payload?.code !== "00000") {
    throw new Error(payload?.info || `请求失败：HTTP ${response.status}`);
  }
  return payload?.data as T;
}

export function read_mobile_access(base_url: string): Promise<boolean> {
  return request<boolean>(base_url, "/api/devices/mobile-access");
}

export function write_mobile_access(base_url: string, enabled: boolean): Promise<boolean> {
  return request<boolean>(base_url, "/api/devices/mobile-access", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
}

export function create_pairing_code(base_url: string): Promise<pairing_code> {
  return request<pairing_code>(base_url, "/api/devices/pairing-codes", { method: "POST" });
}

export function list_devices(base_url: string): Promise<device_view[]> {
  return request<device_view[]>(base_url, "/api/devices");
}

export async function revoke_device(base_url: string, device_id: string): Promise<void> {
  await request<null>(base_url, `/api/devices/${encodeURIComponent(device_id)}`, { method: "DELETE" });
}

export function rotate_device(base_url: string, device_id: string): Promise<device_pair_result> {
  return request<device_pair_result>(base_url, `/api/devices/${encodeURIComponent(device_id)}/rotate`, {
    method: "POST",
  });
}