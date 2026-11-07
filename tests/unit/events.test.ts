import { describe, expect, it } from "vitest";
import { is_known_stream_event, merge_events_by_seq, stream_event_types } from "../../src/lib/events";

const event = (seq: number) => ({ seq, value: `v${seq}` });

describe("stream event whitelist", () => {
  it("白名单包含 11 个事件", () => {
    expect(stream_event_types).toHaveLength(11);
  });

  it("已知事件通过，未知事件拒绝", () => {
    expect(is_known_stream_event("chunk")).toBe(true);
    expect(is_known_stream_event("step_break")).toBe(true);
    expect(is_known_stream_event("unknown_event")).toBe(false);
  });
});

describe("merge_events_by_seq", () => {
  it("重复事件只保留一条", () => {
    const result = merge_events_by_seq([event(1)], [event(1), event(2)]);
    expect(result.events.map((e) => e.seq)).toEqual([1, 2]);
    expect(result.duplicates).toBe(1);
  });

  it("乱序事件按 seq 排序，不回退", () => {
    const result = merge_events_by_seq([], [event(3), event(1), event(2)]);
    expect(result.events.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(result.out_of_order).toBeGreaterThan(0);
  });

  it("缺口被识别为待补拉起点", () => {
    const result = merge_events_by_seq([], [event(1), event(2), event(4)]);
    expect(result.gap_from).toBe(3);
  });

  it("补齐后恢复无缺口", () => {
    const result = merge_events_by_seq([event(1), event(2), event(4)], [event(3)]);
    expect(result.gap_from).toBeNull();
    expect(result.events.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
  });
});