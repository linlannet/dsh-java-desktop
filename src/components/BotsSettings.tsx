import { useCallback, useEffect, useRef, useState } from "react";
import type { FeishuBot, FeishuPairing } from "../lib/agent-client";
import {
  cancelBotPairing,
  deleteBot,
  getBotPairing,
  listBots,
  saveBot,
  setBotEnabled,
  startBotPairing,
  testBot,
} from "../lib/agent-client";
import { ExtensionDisconnected, ExtensionNotices, useExtensionNotify } from "./ExtensionsSettings";

/** 配对终态：轮询到这些状态即停止。 */
const PAIRING_TERMINAL = ["success", "failed", "expired", "cancelled", "canceled"];

function connectionLabel(bot: FeishuBot): { text: string; chip: string } {
  const state = (bot.connectionState || "").toUpperCase();
  if (state === "CONNECTED" || state === "RUNNING") return { text: "在线", chip: "online" };
  if (bot.lastError) return { text: "异常", chip: "error" };
  return { text: bot.enabled ? "离线" : "停用", chip: "muted" };
}

/**
 * 飞书 Bot 设置面板（对应后端 /api/harness/bots）。
 * 一键绑定：POST /pairing → 轮询 GET /pairing/{id} → 成功后刷新列表。
 */
export function BotsSettings({ servicePort }: { servicePort: number | null }) {
  const { notice, error, notify, fail, setNotice, setError } = useExtensionNotify();
  const [bots, setBots] = useState<FeishuBot[]>([]);
  const [loading, setLoading] = useState(false);

  // 一键配对
  const [pairingName, setPairingName] = useState("");
  const [pairing, setPairing] = useState<FeishuPairing | null>(null);
  const [pairingBusy, setPairingBusy] = useState(false);
  const pairingTimer = useRef<number | null>(null);

  // 手动添加弹窗
  const [showAdd, setShowAdd] = useState(false);
  const [botName, setBotName] = useState("");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [saving, setSaving] = useState(false);

  const stopPolling = useCallback(() => {
    if (pairingTimer.current !== null) {
      window.clearInterval(pairingTimer.current);
      pairingTimer.current = null;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!servicePort) return;
    setLoading(true);
    try {
      setBots(await listBots(servicePort));
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [servicePort, fail]);

  useEffect(() => {
    void refresh();
    return stopPolling;
  }, [refresh, stopPolling]);

  if (!servicePort) {
    return <ExtensionDisconnected text="智能体服务未连接，无法管理飞书 Bot。" />;
  }

  const beginPairing = async () => {
    setPairingBusy(true);
    setError("");
    setNotice("");
    try {
      const started = await startBotPairing(servicePort, pairingName.trim() || undefined);
      setPairing(started);
      stopPolling();
      pairingTimer.current = window.setInterval(async () => {
        try {
          const current = await getBotPairing(servicePort, started.pairingId);
          setPairing(current);
          const status = (current.status || "").toLowerCase();
          if (status.includes("success")) {
            stopPolling();
            setPairing(null);
            setPairingName("");
            notify(`绑定成功，Bot「${current.botId || started.pairingId}」已上线`);
            await refresh();
          } else if (PAIRING_TERMINAL.some((t) => status.includes(t))) {
            stopPolling();
            fail(`绑定未完成：${current.error || current.status}`);
          }
        } catch (err) {
          stopPolling();
          setPairing(null);
          fail(err instanceof Error ? err.message : String(err));
        }
      }, 2_000);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    } finally {
      setPairingBusy(false);
    }
  };

  const cancelPairing = async () => {
    stopPolling();
    const current = pairing;
    setPairing(null);
    if (!current) return;
    try {
      await cancelBotPairing(servicePort, current.pairingId);
    } catch {
      // 取消失败不影响界面状态
    }
  };

  const submitAdd = async () => {
    if (!botName.trim() || !appId.trim()) return;
    setSaving(true);
    try {
      const saved = await saveBot(servicePort, {
        botName: botName.trim(),
        appId: appId.trim(),
        appSecret: appSecret.trim() || undefined,
        // 后端聚合要求 agentBaseId 非空；与一键配对共用 harness.yml 的默认值
        agentBaseId: "feishu-agent",
      });
      setShowAdd(false);
      setBotName("");
      setAppId("");
      setAppSecret("");
      notify(`Bot「${saved.botName}」已创建`);
      await refresh();
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleBot = async (bot: FeishuBot) => {
    try {
      await setBotEnabled(servicePort, bot.botId, !bot.enabled);
      notify(`Bot「${bot.botName}」已${bot.enabled ? "停用" : "启用"}`);
      await refresh();
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
  };

  const testBotConnection = async (bot: FeishuBot) => {
    try {
      const tested = await testBot(servicePort, bot.botId);
      if (tested.lastError) {
        fail(`「${bot.botName}」连接测试失败：${tested.lastError}`);
      } else {
        notify(`「${bot.botName}」连接正常`);
      }
      await refresh();
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
  };

  const removeBot = async (bot: FeishuBot) => {
    if (!window.confirm(`确定删除 Bot「${bot.botName}」？`)) return;
    try {
      await deleteBot(servicePort, bot.botId);
      notify(`Bot「${bot.botName}」已删除`);
      await refresh();
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <>
      <ExtensionNotices
        notice={notice}
        error={error}
        onClearNotice={() => setNotice("")}
        onClearError={() => setError("")}
      />

      {/* ── 一键绑定飞书 ── */}
      <section className="settings-panel">
        <div className="settings-panel-head">
          <div>
            <h2>
              一键绑定飞书 <span className="status-chip online">推荐</span>
            </h2>
            <p>打开绑定点，用手机飞书扫码确认，应用会自动创建——Bot 自动上线，全程无需手动填凭证。</p>
          </div>
        </div>
        <div className="pairing-form">
          <input
            value={pairingName}
            placeholder="应用名称（默认 DeepSeek Bot）"
            onChange={(event) => setPairingName(event.target.value)}
            disabled={!!pairing}
          />
          <button className="primary-action compact" onClick={() => void beginPairing()} disabled={pairingBusy || !!pairing}>
            {pairingBusy ? "发起中…" : "开始绑定"}
          </button>
        </div>
        {pairing ? (
          <div className="empty-card">
            <div>
              配对状态：<strong>{pairing.status}</strong>
              {pairing.expireIn ? ` · 剩余 ${Math.max(1, Math.round((pairing.expireIn || 0) / 1000))} 秒` : ""}
            </div>
            {pairing.userCode ? <div>确认码：<strong>{pairing.userCode}</strong></div> : null}
            {pairing.url ? <div style={{ wordBreak: "break-all" }}>绑定链接：{pairing.url}</div> : null}
            <div>请用手机飞书扫码确认，确认后此处会自动完成绑定。</div>
            <button className="ghost-action compact" onClick={() => void cancelPairing()}>取消绑定</button>
          </div>
        ) : null}
      </section>

      {/* ── 我的 Bot ── */}
      <section className="settings-panel">
        <div className="settings-panel-head">
          <div>
            <h2>我的 Bot</h2>
            <p>启用即建立长连接；状态实时反馈连接健康度。每个飞书会话会自动派生独立 Agent。</p>
          </div>
          <div className="plugin-list-head-actions">
            <button className="ghost-action compact" onClick={() => void refresh()} disabled={loading}>
              {loading ? "刷新中…" : "刷新"}
            </button>
            <button className="primary-action compact" onClick={() => setShowAdd(true)}>
              ＋ 手动添加
            </button>
          </div>
        </div>
        {bots.length === 0 ? (
          <div className="empty-card">还没有 Bot，用上方「一键绑定」或「手动添加」创建。</div>
        ) : (
          <div className="plugin-list">
            {bots.map((bot) => {
              const conn = connectionLabel(bot);
              return (
                <article key={bot.botId} className="plugin-row">
                  <div className="plugin-row-main">
                    <strong>{bot.botName}</strong>
                    <span>AppID: {bot.appId || "-"}</span>
                    <small>
                      连接: {bot.connectionState || "-"}
                      {bot.lastError ? ` · ${bot.lastError}` : ""}
                      {bot.updatedAt ? ` · 更新于 ${bot.updatedAt}` : ""}
                    </small>
                  </div>
                  <div className="plugin-row-badges">
                    <span className={`status-chip ${conn.chip}`}>{conn.text}</span>
                    <span className={`status-chip ${bot.enabled ? "online" : "muted"}`}>
                      {bot.enabled ? "已启用" : "已停用"}
                    </span>
                  </div>
                  <div className="plugin-row-actions">
                    <button className="ghost-action compact" onClick={() => void toggleBot(bot)}>
                      {bot.enabled ? "禁用" : "启用"}
                    </button>
                    <button className="ghost-action compact" onClick={() => void testBotConnection(bot)}>测试</button>
                    <button className="danger-action compact" onClick={() => void removeBot(bot)}>删除</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ── 手动添加 Bot 弹窗 ── */}
      {showAdd ? (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>手动添加 Bot</h3>
              <button className="modal-close" onClick={() => setShowAdd(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <label className="form-field span-2">
                  <span>Bot 名称</span>
                  <input value={botName} placeholder="例如：DeepSeek Bot" onChange={(event) => setBotName(event.target.value)} />
                </label>
                <label className="form-field span-2">
                  <span>App ID</span>
                  <input value={appId} placeholder="飞书应用 App ID" onChange={(event) => setAppId(event.target.value)} />
                </label>
                <label className="form-field span-2">
                  <span>App Secret</span>
                  <input type="password" value={appSecret} placeholder="飞书应用 App Secret" onChange={(event) => setAppSecret(event.target.value)} />
                </label>
              </div>
            </div>
            <div className="modal-actions">
              <button className="ghost-action" onClick={() => setShowAdd(false)}>取消</button>
              <button className="primary-action compact" onClick={() => void submitAdd()} disabled={saving || !botName.trim() || !appId.trim()}>
                {saving ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default BotsSettings;
