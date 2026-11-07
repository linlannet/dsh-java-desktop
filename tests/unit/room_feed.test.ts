import { describe, expect, it } from "vitest";
import { buildRoomFeed } from "../../src/lib/room-feed";
import type { RoomEvent } from "../../src/lib/digital-human-client";

function event(
  partial: Partial<RoomEvent> & { type: string; seq: number; payload: Record<string, unknown> },
): RoomEvent {
  return { id: `e${partial.seq}`, roomId: "room-1", ...partial };
}

describe("room-feed 流式合并与续传", () => {
  it("同任务的流式分片与最终消息合并为一条，内容以定稿为准", () => {
    const events: RoomEvent[] = [
      event({ type: "MESSAGE_CHUNK", seq: 1, taskId: "t1", payload: { text: "你" } }),
      event({ type: "MESSAGE_CHUNK", seq: 2, taskId: "t1", payload: { text: "好" } }),
      event({
        type: "MESSAGE_CREATED",
        seq: 3,
        taskId: "t1",
        payload: { role: "assistant", content: "你好" },
      }),
    ];

    const feed = buildRoomFeed(events, []);
    const messages = feed.filter((item) => item.kind === "human-message");

    expect(messages).toHaveLength(1);
    expect(messages[0].kind === "human-message" && messages[0].content).toBe("你好");
  });

  it("重复到达的同一分片不会产生第二条消息", () => {
    const events: RoomEvent[] = [
      event({ type: "MESSAGE_CHUNK", seq: 1, taskId: "t2", payload: { text: "a" } }),
      event({ type: "MESSAGE_CHUNK", seq: 1, taskId: "t2", payload: { text: "a" } }),
    ];

    const feed = buildRoomFeed(events, []);
    expect(feed.filter((item) => item.kind === "human-message")).toHaveLength(1);
  });

  it("无任务归属的消息按 seq 独立成条，不丢失", () => {
    const events: RoomEvent[] = [
      event({ type: "MESSAGE_CHUNK", seq: 10, payload: { text: "总结一" } }),
      event({ type: "MESSAGE_CHUNK", seq: 11, payload: { text: "总结二" } }),
    ];

    const feed = buildRoomFeed(events, []);
    expect(feed.filter((item) => item.kind === "human-message")).toHaveLength(2);
  });
});