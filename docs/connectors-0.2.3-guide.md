# 连接器设置（dsh-java 0.2.3 功能移植）

> 桌面端 `设置 → 扩展 → 连接器` 页，对齐 dsh-java 0.2.3 `ConnectorController`（`/api/harness/connectors`）。
> 品牌、功能预览、连接状态与诊断全部来自服务端；桌面端不接触任何 token。

## 1. 能力来源对照

| dsh-java-app 0.2.3 | desktop 对应实现 |
|---|---|
| 插件页内 `renderConnectorSettings()` | 独立设置页 `src/components/ConnectorsSettings.tsx` |
| `CONNECTOR_API='/api/harness/connectors'` | `src/lib/agent-client.ts` 的 `listConnectorAssessments/listConnectorAccounts/connectConnector/disconnectConnector/refreshConnector` |
| `connectorAssessments/connectorAccounts` 状态 | React `useState` + `load()` |
| `runConnectorAction(id, action)` | `runAction(id, 'connect'|'disconnect'|'refresh')` |
| OAuth 用 `window.location.assign(url)` | 用 `native_invoke("open_external", { url })` 打开系统浏览器（Tauri 无路由，避免 WebView 导航） |
| zh-CN / en-US 文案 | 功能预览优先 `zh-CN`、回退 `en-US`；状态标签中文 |

## 2. 后端契约（端点）

| 方法 | 路径 | 响应 data |
|---|---|---|
| GET | `/api/harness/connectors/assessments` | `ConnectorAssessmentDTO[]` |
| GET | `/api/harness/connectors/accounts` | `ConnectorAccountStatusDTO[]` |
| POST | `/api/harness/connectors/accounts/{id}/connect` | `ConnectorAccountStatusDTO` |
| POST | `/api/harness/connectors/accounts/{id}/disconnect` | `ConnectorAccountStatusDTO` |
| POST | `/api/harness/connectors/accounts/{id}/refresh` | `ConnectorAccountStatusDTO` |

统一响应包装：`{ code: "00000", info, data }`，桌面端 `agent-client.request()` 只接受 `response.ok && code === "00000"`。

## 3. 交互说明

- **连接 / 重新授权**：无已注册账号提供方（provider）时按钮禁用；`connected=true` 显示"重新授权"。
- **OAuth 跳转**：`connect` 返回 `state=AUTHORIZATION_REQUIRED` 且带 `authorizationUrl` 时，校验协议为 http/https 后用系统浏览器打开；完成授权后回来点"刷新"。
- **断开**：仅 `state !== DISCONNECTED` 时显示。
- **刷新令牌**：仅 `connected=true` 时显示，调用后端 `refresh`（Web 端 0.2.3 未暴露该按钮，桌面端补上）。
- **诊断**：账号状态里的 `diagnostic { code, message, retryable }` 直接展示，不翻译后端原文。
- **状态标签**：CONNECTED=已连接、DISCONNECTED=未连接、AUTHORIZATION_REQUIRED=等待授权、EXPIRED=授权已过期、ERROR=连接异常；无账号显示"提供方未注册"。

## 4. 已知边界

- OAuth callback（`/api/harness/connectors/accounts/{id}/oauth/callback`）由后端处理并返回 JSON；桌面端通过"刷新"按钮拉取最终状态，不做 deep-link。
- 连接器账号状态、待授权 state 与令牌缓存在 dsh-java 进程内（0.2.3 已知限制），服务重启后需重新连接。
- 具体提供方（WeCom/DingTalk/Notion/Linear 等）由插件注册；未注册时页面显示"提供方未注册"，不会伪报已连接。
- 品牌色取自前端常量 `BRAND_COLORS`（对齐 app.css 的 7 个品牌）；新增连接器会自动回退到默认色。
