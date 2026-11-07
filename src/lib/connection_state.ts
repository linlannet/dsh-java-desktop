export type connection_state =
  | "UNCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING"
  | "AUTH_FAILED"
  | "UNREACHABLE";

export interface retry_plan {
  delay_ms: number;
  attempt: number;
}

export function backoff_delay(attempt: number): number {
  const safe_attempt = Math.max(1, attempt);
  return Math.min(15_000, 1_000 * 2 ** Math.min(safe_attempt - 1, 4));
}

export class ConnectionStateMachine {
  private state: connection_state = "UNCONNECTED";
  private failures = 0;

  get current(): connection_state {
    return this.state;
  }

  get failure_count(): number {
    return this.failures;
  }

  on_connect_start(): void {
    this.state = this.failures > 0 ? "RECONNECTING" : "CONNECTING";
  }

  on_connected(): void {
    this.state = "CONNECTED";
    this.failures = 0;
  }

  on_auth_failed(): void {
    this.state = "AUTH_FAILED";
  }

  on_failure(): retry_plan {
    this.failures += 1;
    this.state = this.failures >= 3 ? "RECONNECTING" : "UNREACHABLE";
    return { delay_ms: backoff_delay(this.failures), attempt: this.failures };
  }

  can_auto_retry(): boolean {
    return this.state !== "AUTH_FAILED";
  }

  manual_retry(): void {
    if (this.state === "AUTH_FAILED") return;
    this.state = "CONNECTING";
  }

  reset(): void {
    this.state = "UNCONNECTED";
    this.failures = 0;
  }
}