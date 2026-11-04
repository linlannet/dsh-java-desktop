import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildRoomFeed } from '../../src/lib/room-feed';
import type { RoomEvent } from '../../src/lib/digital-human-client';
import type {
  ConversationMessage,
  DigitalHuman,
  RuntimeApproval,
  RuntimeQuestion,
  SessionSummary,
} from '../../src/types';

/**
 * 契约测试：消费 dsh-java/docs/spec/contract/fixtures 下的 canonical fixtures。
 * 目录缺失时整体跳过（CI 未 checkout dsh-java 的场景）。
 */
const canonical = new URL('../../../dsh-java/docs/spec/0.2.2/contract/fixtures', import.meta.url);
const legacy = new URL('../../../dsh-java/docs/spec/contract/fixtures', import.meta.url);
const canonicalPath = fileURLToPath(canonical);
const fixtureDir =
  process.env.DSH_CONTRACT_DIR ??
  (existsSync(canonicalPath) ? canonicalPath : fileURLToPath(legacy));
const available = existsSync(fixtureDir);

const load = <T>(name: string): T =>
  JSON.parse(readFileSync(`${fixtureDir}/${name}`, 'utf8')) as T;

const suite = available ? describe : describe.skip;

suite('客户端契约 v1（与 mobile 共用同一份 fixtures）', () => {
  const files = [
    'session-list.json',
    'session-timeline.json',
    'stream-events.json',
    'approvals-questions.json',
    'digital-humans.json',
    'room-events.json',
    'feishu-bots.json',
  ];

  it.each(files)('%s 归属契约 v1', (file) => {
    const doc = load<{ contractVersion: number; kind: string }>(file);
    expect(doc.contractVersion).toBe(1);
    expect(doc.kind).toBeTruthy();
  });

  it('会话列表字段与 SessionSummary 对齐', () => {
    const doc = load<{ sessions: SessionSummary[] }>('session-list.json');
    expect(doc.sessions.length).toBeGreaterThan(0);
    for (const s of doc.sessions) {
      expect(s.sessionId).toBeTruthy();
      expect(s.agentId).toBeTruthy();
      expect(s.title).toBeTruthy();
    }
  });

  it('消息时间线含 user/assistant/tool 且 tool 消息带工具元数据', () => {
    const doc = load<{ messages: ConversationMessage[] }>('session-timeline.json');
    const roles = doc.messages.map((m) => m.role);
    expect(roles).toContain('user');
    expect(roles).toContain('assistant');
    expect(roles).toContain('tool');

    const tool = doc.messages.find((m) => m.role === 'tool');
    expect(tool?.toolName).toBeTruthy();
    expect(tool?.callId).toBeTruthy();
    expect(tool?.status).toBe('done');

    const attributed = doc.messages.find((m) => m.attribution);
    expect(attributed?.attribution?.digitalHumanId).toBeTruthy();
    expect(attributed?.attribution?.displayName).toBeTruthy();
  });

  it('流式事件 seq 严格递增且事件名在白名单内', () => {
    const doc = load<{ events: Array<{ seq: number; type: string }> }>('stream-events.json');
    const allowed = new Set([
      'meta', 'reasoning', 'chunk', 'tool', 'tool_result',
      'approval', 'question', 'finish', 'done', 'step_break', 'error',
    ]);
    let prev = 0;
    for (const e of doc.events) {
      expect(e.seq).toBeGreaterThan(prev);
      expect(allowed.has(e.type)).toBe(true);
      prev = e.seq;
    }
  });

  it('审批与提问使用统一主键 approvalId / questionId', () => {
    const doc = load<{ approvals: RuntimeApproval[]; questions: RuntimeQuestion[] }>(
      'approvals-questions.json',
    );
    for (const a of doc.approvals) {
      expect(a.approvalId).toBeTruthy();
      expect(a.toolName).toBeTruthy();
    }
    for (const q of doc.questions) {
      expect(q.questionId).toBeTruthy();
      expect(q.questions.length).toBeGreaterThan(0);
      for (const item of q.questions) {
        expect(item.id).toBeTruthy();
        expect(item.question).toBeTruthy();
        for (const opt of item.options ?? []) {
          expect(opt.label).toBeTruthy();
        }
      }
    }
  });

  it('数字人枚举取值合法', () => {
    const doc = load<{ humans: DigitalHuman[] }>('digital-humans.json');
    const endpointTypes = new Set(['local-dsh', 'remote-dsh', 'a2a']);
    const policies = new Set(['AUTO_ALLOW', 'WRITE_REQUIRES_APPROVAL', 'ALWAYS_CONFIRM']);
    for (const h of doc.humans) {
      expect(h.id).toBeTruthy();
      expect(endpointTypes.has(h.endpoint.type)).toBe(true);
      expect(policies.has(h.approvalPolicy)).toBe(true);
    }
  });

  it('飞书 Bot 字段与状态枚举合法且不泄漏 appSecret', () => {
    const doc = load<{
      bots: Array<{
        botId: string;
        appId: string;
        secretRef: string;
        secretConfigured: boolean;
        connectionState: string;
        appSecret?: string;
      }>;
      pairing: { pairingId: string; status: string };
      connectionStates: string[];
      pairingStatuses: string[];
    }>('feishu-bots.json');

    const states = new Set(doc.connectionStates);
    for (const b of doc.bots) {
      expect(b.botId).toBeTruthy();
      expect(b.appId).toBeTruthy();
      expect(b.secretRef).toBeTruthy();
      expect(typeof b.secretConfigured).toBe('boolean');
      expect(states.has(b.connectionState)).toBe(true);
      expect(b.appSecret).toBeUndefined();
    }

    expect(doc.pairingStatuses).toContain(doc.pairing.status);
    expect(doc.pairing.pairingId).toBeTruthy();
  });

  it('房间事件 seq 递增且可被 buildRoomFeed 消费', () => {
    const doc = load<{ events: RoomEvent[]; humans?: DigitalHuman[] }>('room-events.json');
    let prev = 0;
    for (const e of doc.events) {
      expect(e.seq).toBeGreaterThan(prev);
      expect(e.roomId).toBeTruthy();
      expect(e.type).toBeTruthy();
      prev = e.seq;
    }

    const humans = load<{ humans: DigitalHuman[] }>('digital-humans.json').humans;
    const feed = buildRoomFeed(doc.events, humans);
    expect(Array.isArray(feed)).toBe(true);
  });
});
