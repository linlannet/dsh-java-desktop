# 桌面端 EMIS 企业身份登录（OIDC）说明

> 桌面端的"EMIS登录"已与 Web 控制台对齐：身份由 linlan-emis 统一签发，
> dsh-java 后端走 OIDC 授权码 + PKCE + JWKS 验签，token 只保存在宿主 HttpSession，
> 桌面端 localStorage 只存展示用身份（不含 token），不再有"填 URI + 用户名密码 + 模拟登录"的旧模式。

## 1. 登录链路

```text
桌面端（点账号入口 / 设置里的"使用企业账号登录"）
  → 生成一次性 ticket，native_invoke("open_external") 打开系统浏览器：
      {dsh-java base}/api/emis/login?return=/bridge.html&ticket=<ticket>
  → dsh-java 302 到 linlan-emis /oauth2/authorize（PKCE S256）
  → 用户在浏览器完成登录，IdP 回调 dsh-java /api/emis/callback
  → 后端验 state / code / JWKS / issuer，把身份挂到 ticket，302 到 /bridge.html?ticket=...&status=success
  → 桌面端轮询 GET /api/emis/ticket?ticket=<ticket>，一次性取回身份并保存
```

- ticket：32 字节随机 Base64URL，5 分钟有效、一次性消费；取回即删。
- 浏览器 bridge 页只显示"登录成功，可关闭窗口"，桌面端自动同步身份。
- 退出：`POST /api/emis/logout` 失效后端会话 + 清本地身份与 ticket。

## 2. 前置配置（dsh-java 后端，环境变量）

OIDC 默认关闭，必须设置（与 Web 端同一套 `DSH_EMIS_OIDC_*`）：

```bash
DSH_EMIS_OIDC_ENABLED=true
DSH_EMIS_OIDC_BASE_URL=http://127.0.0.1:8080                    # linlan-emis 地址
DSH_EMIS_OIDC_CLIENT_ID=<registered-client-id>
DSH_EMIS_OIDC_CLIENT_SECRET=<secret>                            # 仅环境变量，不落文件
DSH_EMIS_OIDC_REDIRECT_URI=http://localhost:<port>/api/emis/callback  # 与桌面端连接的后端端口一致
DSH_EMIS_OIDC_ISSUER=http://localhost:8080
DSH_EMIS_OIDC_POST_LOGOUT_REDIRECT_URI=http://localhost:<port>/
```

注意：
- `REDIRECT_URI` 的 host/port 必须与打开 login 时使用的 host/port 一致，否则 servlet session cookie 不共享，callback 会报"登录会话已失效"。
  - 桌面端外部服务端口来自 Rust：`DSH_AGENT_URL` 或默认探测 8090；内嵌 JAR 为随机端口。
  - 若用固定外部 8090，配置 `http://localhost:8090/api/emis/callback` 即可。
- IdP 侧 client 需把该 `redirect_uri` 加入允许列表；scopes 至少 `openid profile`。
- linlan-emis 默认 `test-client / test-secret` 仅演示用，redirect-uri 为 8081；正式使用请注册专用 client。

## 3. 桌面端使用步骤

1. 设置 → 系统 → **EMIS登录** → 勾选"开启登录入口"→ 保存配置（底部账号入口才显示）。
2. 点击底部"未登录"账号入口，或设置面板"使用企业账号登录"。
3. 系统浏览器打开企业身份登录页，完成授权。
4. 回到桌面应用（或点设置面板"刷新身份"），等待身份同步；成功后账号入口显示当前人员（头像/昵称 + 角色）。
5. 退出：点账号入口 → 退出登录。

## 4. 涉及文件

**后端 dsh-java**
- `EmisOidcController.java`：`login` 增加 `ticket` 参数；`callback` 成功后写 ticket 并回跳 `/bridge.html`；新增 `GET /api/emis/ticket`（一次性身份）。
- `RouteAuthResolver.java`：放行 `/bridge.html` 匿名访问。
- `static/bridge.html`：登录完成落地页。

**桌面端 dsh-desktop**
- `src/lib/emis-oidc.ts`（新增）：ticket 登录、轮询、配置/身份存取、退出。
- `src/components/AccountSettings.tsx`：重写为 EMIS OIDC 面板（开关 / 登录 / 刷新 / 退出 / 当前身份）。
- `src/components/Sidebar.tsx`：账号入口改为 OIDC 流程，删除旧用户名密码弹窗。

## 5. 登录态跨重启保持

已实现"登录一次，后端/桌面端重启后免登录"：

- **后端签发 session**：callback 成功时生成自包含会话凭据 `base64url(身份JSON|过期毫秒).HMAC-SHA256`，随 `/api/emis/ticket` 返回；默认 7 天有效。HMAC 密钥由 `SESSION_SIGN_PREFIX + DSH_EMIS_OIDC_CLIENT_SECRET` 派生（client-secret 仅环境变量注入，不落文件）。**session 只含展示用身份，不含 OIDC access/id token**。
- **桌面端安全存储**：登录成功后用 Tauri `save_credential`（应用数据目录、0600 权限文件）保存 session 串，引用键 `DSH_EMIS_SESSION`；localStorage 只存展示用身份。
- **启动恢复**：服务就绪后 `App.tsx` 调用 `restoreEmisSession()`，从 Tauri 凭据读 session → `GET /api/emis/session?session=...` 验签换回身份 → 刷新账号入口。
- **失效处理**：session 过期/篡改验签失败返回 40100，自动清除 Tauri 凭据与本地身份；退出登录调用 `/api/emis/logout` 并删除凭据。

> 注意：HMAC 密钥派生自 `DSH_EMIS_OIDC_CLIENT_SECRET`，因此**该 secret 变更会导致既有 session 全部失效**（需重新登录）。这符合密钥轮换语义。

### 凭据存储与过期清理

- **同文件存储**：`DSH_EMIS_SESSION` 与数字人凭据共用应用数据目录下的 `digital-human-credentials.json`（Rust `save_credential`，0600 权限），业务侧只引用 credentialRef，不散落明文。
- **过期项回收**：
  - 后端 ticket（登录中转票据，内存）在 `login`/`callback`/`consumeTicket` 时通过 `purgeExpiredTickets()` 懒清理（5 分钟 TTL）。
  - 桌面端 `App.tsx` 每 10 分钟调用 `cleanupExpiredEmisSession()`，用 session 向 `/api/emis/session` 校验；无效（过期/篡改/密钥轮换）则删除 Tauri 凭据与本地身份。
  - 启动恢复 `restoreEmisSession()` 遇到 40100 也会立即清除失效凭据。
  - 网络不可达时不清除凭据，避免抖动误删。

## 6. 已知边界

- 无 deep-link：回跳靠浏览器 bridge 页 + 桌面端轮询，不需要新增 Tauri 插件。
- ticket（登录中转票据）仍只在内存、5 分钟有效，登录中断请重新发起；但**登录完成后的 session 凭据是跨重启持久化的**。
- 桌面端不落 OIDC token；持久化的是后端签发的、只含展示身份的 HMAC session。
- 若 `DSH_EMIS_OIDC_ENABLED=false` 或未配置，`/api/emis/login` 返回 50300，界面会提示登录失败——这是预期的安全行为（不降级匿名）。
