import { useCallback, useEffect, useState } from "react";
import {
  connectConnector,
  disconnectConnector,
  listConnectorAccounts,
  listConnectorAssessments,
  refreshConnector,
} from "../lib/agent-client";
import { native_invoke } from "../platform/native";
import type { ConnectorAccountState, ConnectorAccountStatus, ConnectorAssessment } from "../types";

/**
 * 连接器账号设置（dsh-java 0.2.3 功能移植）。
 * 品牌、功能预览与账号状态由服务端提供；令牌只保存在服务端，前端不接触 token。
 * OAuth 授权跳转用系统浏览器（与 EMIS 登录一致），不在 WebView 内导航。
 */

type ConnectorsSettingsProps = { servicePort: number | null };

function stateLabel(state?: ConnectorAccountState): string {
  const map: Record<string, string> = {
    CONNECTED: "已连接",
    DISCONNECTED: "未连接",
    AUTHORIZATION_REQUIRED: "等待授权",
    EXPIRED: "授权已过期",
    ERROR: "连接异常",
  };
  return (state && map[state]) || state || "未知";
}

function stateClass(status?: ConnectorAccountStatus | null): string {
  if (status?.connected) return "online";
  if (status?.state === "ERROR" || status?.state === "EXPIRED") return "offline";
  return "muted";
}

const BRAND_COLORS: Record<string, string> = {
  feishu: "#3370ff",
  wecom: "#07c160",
  dingtalk: "#1677ff",
  notion: "#292929",
  linear: "#5e6ad2",
  "tencent-docs": "#2b6de5",
  "tencent-meeting": "#2563eb",
};

function brandInitials(assessment: ConnectorAssessment): string {
  const map: Record<string, string> = {
    feishu: "Fe", wecom: "We", dingtalk: "Di", notion: "No", linear: "Li",
    "tencent-docs": "TD", "tencent-meeting": "TM",
  };
  return map[assessment.connectorId] || (assessment.displayName || "?").slice(0, 2);
}

export default function ConnectorsSettings({ servicePort }: ConnectorsSettingsProps) {
  const [assessments, setAssessments] = useState<ConnectorAssessment[]>([]);
  const [accounts, setAccounts] = useState<ConnectorAccountStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!servicePort) return;
    setLoading(true);
    setError("");
    try {
      const [a, s] = await Promise.all([
        listConnectorAssessments(servicePort),
        listConnectorAccounts(servicePort),
      ]);
      setAssessments(Array.isArray(a) ? a : []);
      setAccounts(Array.isArray(s) ? s : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "读取连接器失败");
    } finally {
      setLoading(false);
    }
  }, [servicePort]);

  useEffect(() => { void load(); }, [load]);

  const upsert = (next: ConnectorAccountStatus) => {
    setAccounts((current) => [...current.filter((a) => a.connectorId !== next.connectorId), next]);
  };

  const runAction = async (connectorId: string, action: "connect" | "disconnect" | "refresh") => {
    if (!servicePort || busyId) return;
    setBusyId(connectorId);
    setNotice("");
    try {
      const next = action === "connect"
        ? await connectConnector(servicePort, connectorId)
        : action === "disconnect"
          ? await disconnectConnector(servicePort, connectorId)
          : await refreshConnector(servicePort, connectorId);
      upsert(next);
      if (action === "connect" && next.state === "AUTHORIZATION_REQUIRED" && next.authorizationUrl) {
        let target: URL;
        try { target = new URL(next.authorizationUrl); }
        catch { throw new Error("授权地址格式无效"); }
        if (target.protocol !== "https:" && target.protocol !== "http:") {
          throw new Error("授权地址协议不受支持");
        }
        await native_invoke("open_external", { url: target.toString() });
        setNotice("已打开系统浏览器进行授权，完成后回来刷新状态。");
        return;
      }
      setNotice(action === "disconnect" ? "连接器已断开" : `操作完成：${stateLabel(next.state)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "连接器操作失败");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="set-section">
      <div className="set-section-label">连接器账号</div>
      <section className="set-card">
        <p className="account-hint">
          品牌、功能预览与连接状态由服务端提供；令牌仅保存在服务端。OAuth 授权会打开系统浏览器。
        </p>
        <div className="account-actions">
          <button type="button" className="ghost-action compact" onClick={() => void load()} disabled={loading || !servicePort}>
            {loading ? "加载中…" : "刷新"}
          </button>
        </div>
        {error ? <div className="account-msg err">{error}</div> : null}
        {notice ? <div className="account-msg ok">{notice}</div> : null}
      </section>

      <div className="set-section-label">可用连接器</div>
      {loading && assessments.length === 0 ? (
        <section className="set-card"><span style={{ fontSize: 12, color: "var(--text-subtle)" }}>正在加载连接器…</span></section>
      ) : assessments.length === 0 ? (
        <section className="set-card"><span style={{ fontSize: 12, color: "var(--text-subtle)" }}>暂无连接器评估信息</span></section>
      ) : (
        <div className="set-card-grid">
          {assessments.map((item) => {
            const account = accounts.find((a) => a.connectorId === item.connectorId) ?? null;
            const color = BRAND_COLORS[item.connectorId] || "#5570f1";
            return (
              <section className="set-card" key={item.connectorId}>
                <div className="set-row">
                  <div className="set-row-main">
                    <strong>{item.displayName || item.connectorId}</strong>
                    <span>{item.connectorId} · {item.upstreamForm || ""}</span>
                  </div>
                  <span
                    className="set-chip"
                    style={{ background: color, color: "#fff" }}
                    title={item.connectorId}
                  >
                    {brandInitials(item)}
                  </span>
                </div>
                {item.decision ? <p className="account-hint">评估：{item.decision}</p> : null}
                {item.javaStrategy ? <p className="account-hint">{item.javaStrategy}</p> : null}
                {item.featurePreviews ? (() => {
                  const previews = item.featurePreviews["zh-CN"] || item.featurePreviews["en-US"] || [];
                  return previews.length ? (
                    <ul style={{ paddingLeft: 18, fontSize: 12, color: "var(--text-subtle)" }}>
                      {previews.map((text, idx) => <li key={idx}>{text}</li>)}
                    </ul>
                  ) : null;
                })() : null}
                <div className="set-row" style={{ marginTop: 8 }}>
                  <span className={`set-chip ${stateClass(account)}`}>
                    {account ? stateLabel(account.state) : "提供方未注册"}
                  </span>
                  {account?.expiresAt ? (
                    <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>到期：{account.expiresAt}</span>
                  ) : null}
                </div>
                {account?.diagnostic ? (
                  <div className="account-msg err">
                    {account.diagnostic.code} · {account.diagnostic.message}
                    {account.diagnostic.retryable ? "（可重试）" : ""}
                  </div>
                ) : null}
                <div className="account-actions">
                  <button
                    type="button"
                    className="primary-action compact"
                    disabled={!account || busyId === item.connectorId || !servicePort}
                    title={account ? undefined : "请先由插件注册账号提供方"}
                    onClick={() => void runAction(item.connectorId, "connect")}
                  >
                    {account?.connected ? "重新授权" : "连接"}
                  </button>
                  {account && account.state !== "DISCONNECTED" ? (
                    <button
                      type="button"
                      className="ghost-action compact"
                      disabled={busyId === item.connectorId || !servicePort}
                      onClick={() => void runAction(item.connectorId, "disconnect")}
                    >
                      断开
                    </button>
                  ) : null}
                  {account?.connected ? (
                    <button
                      type="button"
                      className="ghost-action compact"
                      disabled={busyId === item.connectorId || !servicePort}
                      onClick={() => void runAction(item.connectorId, "refresh")}
                    >
                      刷新令牌
                    </button>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
