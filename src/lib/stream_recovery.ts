export const RECONCILE_POLL_MS = 5_000;

export const RECONNECT_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 15_000] as const;

export function next_backoff(attempt: number): number {
  const index = Math.min(Math.max(attempt, 1) - 1, RECONNECT_BACKOFF_MS.length - 1);
  return RECONNECT_BACKOFF_MS[index];
}

export interface reconcile_options {
  poll_ms?: number;
  max_polls?: number;
  signal?: AbortSignal;
}

/**
 * 流式中断后的对账轮询：按 afterSeq 反复拉取，直到 is_complete 为真。
 * 默认 5s 一轮、最多 12 轮；调用方取消时抛 AbortError。
 */
export async function reconcile_poll<T>(
  fetch_page: () => Promise<T>,
  is_complete: (value: T) => boolean,
  options: reconcile_options = {},
): Promise<T> {
  const poll_ms = options.poll_ms ?? RECONCILE_POLL_MS;
  const max_polls = options.max_polls ?? 12;

  let last = await fetch_page();
  let polls = 0;

  while (!is_complete(last) && polls < max_polls) {
    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    await new Promise((resolve) => setTimeout(resolve, poll_ms));
    last = await fetch_page();
    polls += 1;
  }

  return last;
}