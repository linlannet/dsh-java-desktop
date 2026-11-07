export const stream_event_types = [
  "meta",
  "chunk",
  "reasoning",
  "tool",
  "tool_result",
  "approval",
  "question",
  "finish",
  "done",
  "step_break",
  "error",
] as const;

export type stream_event_type = (typeof stream_event_types)[number];

export function is_known_stream_event(type: string): type is stream_event_type {
  return (stream_event_types as readonly string[]).includes(type);
}

export interface seq_event {
  seq: number;
}

export interface merge_result<T extends seq_event> {
  events: T[];
  gap_from: number | null;
  duplicates: number;
  out_of_order: number;
}

export function merge_events_by_seq<T extends seq_event>(
  existing: T[],
  incoming: T[],
): merge_result<T> {
  const by_seq = new Map<number, T>();
  let duplicates = 0;
  let out_of_order = 0;
  let last_seq = Number.NEGATIVE_INFINITY;

  for (const event of [...existing, ...incoming]) {
    if (by_seq.has(event.seq)) {
      duplicates += 1;
      continue;
    }
    if (event.seq < last_seq) out_of_order += 1;
    if (event.seq > last_seq) last_seq = event.seq;
    by_seq.set(event.seq, event);
  }

  const events = [...by_seq.values()].sort((a, b) => a.seq - b.seq);

  let gap_from: number | null = null;
  for (let i = 1; i < events.length; i += 1) {
    if (events[i].seq !== events[i - 1].seq + 1) {
      gap_from = events[i - 1].seq + 1;
      break;
    }
  }

  return { events, gap_from, duplicates, out_of_order };
}