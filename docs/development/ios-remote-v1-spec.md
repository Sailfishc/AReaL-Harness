**中文** | [English](ios-remote-v1-spec.en.md)

# iOS 遥控端 v1 实施规格（TestFlight）

## 结论

v1 交付一个只在 TestFlight 分发的 iOS App。手机只做控制层：通过组织自建的 Relay 连到电脑上的 Remote Gateway，查看已授权项目，创建和打开会话，发送消息、切换模型、停止当前轮，处理审批和提问，并在电脑需要你时收到推送。所有执行、文件、凭据仍在电脑上的 Core 与 Runtime。

实现方式是用 Capacitor 把现有 Remote Web 客户端的协议层和 GUI 会话组件打包进原生壳，原生部分只补钥匙串、扫码、APNs 推送和前后台生命周期。协议沿用 `areal.remote.v2`，只做加法。界面按本文的设计稿和 `@areal/ui` token 实现，不另起一套样式。

本文面向实施工程师和 Codex。文中“新增”的方法、字段、目录和配置都是提案，实现并通过验收之前不能写成已支持能力。现有能力的权威描述仍是 [Remote 架构](../design/remote-control.md)、[Remote API](../api/remote-control.md) 和 [连接与部署](../guides/remote-control.md)。

## 范围

| 类别 | v1 包含 | v1 不包含 |
| --- | --- | --- |
| 平台与分发 | iOS 16+ iPhone，TestFlight 内测 | Android、iPad 专属布局、App Store 上架、PWA 改造 |
| 网络 | 自建 Relay（默认且唯一入口） | Direct（Tailscale Serve/Funnel、组织 HTTPS 直连）、局域网直连、P2P 打洞 |
| 配对 | App 内扫码、粘贴配对链接、电脑端核对指纹并授权 | 系统相机扫码直接唤起 App（Universal Link）、同一 App 记住多台电脑 |
| 项目与会话 | 已授权项目列表、项目内最近会话、新建会话、打开会话、分页加载历史 | 会话搜索、归档、重命名、Task 排程编辑 |
| 会话操作 | 发送消息、运行中追加（排队）、停止当前轮、模型/推理强度/权限设置 | 附件、语音输入、目标（Goal）创建与编辑、排队消息编辑、steer |
| 介入 | 同步审批、同步提问、Task 异步提问回复、Task 暂停 | 结果审阅（Review）与图片制品、Diff 查看 |
| 推送 | 待处理事项、本设备发起的轮次完成或失败 | 富通知、通知上直接批准、Live Activity |
| 设备安全 | 设备身份存 iOS 钥匙串、清除本机设备 | Face ID 写操作确认、P-256 硬件绑定身份 |

“暂停”在会话里指停止当前轮（`turn.stop`）；Task 拥有的会话不能用普通停止，按现有规则走 `task.pause`。

## 已有基础与复用边界

Remote v2 的 Gateway、加密通道、Relay 和大部分业务方法已经实现。v1 不改它们的语义，只按下表复用。

| 能力 | 现有位置 | v1 用法 |
| --- | --- | --- |
| Gateway、授权、命令映射 | `clients/gui/app/src/core/remote*.cjs` | 不改业务逻辑；新增推送注册方法与通知发送器 |
| Noise 加密通道 | `clients/gui/packages/remote/src/channel.mjs` | 原样复用 |
| Relay 传输封装 | `clients/gui/packages/remote/src/wire.mjs` | 原样复用 `createRemoteWire`、`remoteLocator`；socket 由 App 用已保存的 Relay origin 构造 |
| Relay 服务 | `services/remote-relay/` | 新增 App origin 白名单与 APNs 推送转发 |
| 协议客户端与状态 | `clients/gui/renderer/remote-web/`（`browser-state.mjs`、`command-state.mjs`、`session-state.mjs`、`session-bodies.mjs`） | 抽出与 DOM 无关的部分供 App 使用；存储改为可注入 |
| 会话界面 | `clients/gui/renderer/src/remote/RemoteWorkbench.tsx` 中的 `Messages`、`ConversationComposer`、`ComposerQueue`、`ComposerPermissionMenu` | 会话页直接复用，不复制组件 |
| 设计基础 | `clients/gui/packages/ui`（`tokens.json`、`themes.css`、`foundation.css`、DecisionCard、QuestionCard、FeedbackNotice 等） | 所有颜色、圆角、字号取 token |
| 电脑端配对与授权 | `clients/gui/renderer/src/settings/MobileSettings.tsx`，`remoteControl` 的 `pair/approve/updateGrant/revoke` | 不改流程；设备列表显示设备类型与推送状态 |

现有 `remote.html` 里的原生 DOM 页面（连接、配对、审批、Task 暂停）和 `remote-web/remote.css` 的写死颜色不进入 App。App 用 `@areal/ui` 组件重做这些页面。

## 总体架构

```text
iPhone App（Capacitor 壳，WKWebView）
├─ 界面层      React + @areal/ui；会话页复用 GUI 组件
├─ 视图状态    概览页、当前会话快照、草稿、待核对 commandId（可丢弃投影）
├─ 协议客户端  areal.remote.v2：hello/ready、请求关联、commandId、unknown 只查不重发
├─ 安全通道    @areal/remote Noise + Host pin
├─ 传输        Relay WSS（areal.relay.v1 client 角色）
└─ 平台适配    KeyStore(钥匙串) · Scanner(扫码) · Push(APNs) · Lifecycle(前后台)
        │  出站 WSS
        ▼
自建 Relay（services/remote-relay）── 新增：APNs 推送转发 ──► APNs ──► iPhone
        ▲  Host 出站 WSS（capability 证明房间）
        │
电脑：桌面后台 RemoteControl / Gateway ── 新增：通知发送器
        │
        ▼
各项目 Core（会话与执行的唯一权威）→ Runtime
```

平台适配层是 App 与 Web 唯一的分叉点，接口如下（TypeScript 示意，名称可调整）：

```ts
interface KeyStore {
  load(): Promise<StoredDevice | null>;      // 设备私钥、Host pin、Relay origin、room、grant revision
  save(device: StoredDevice): Promise<void>; // 原子写入；失败必须抛错，不得报告“已记住”
  clear(): Promise<void>;
}
interface Scanner { scan(): Promise<string | null> }          // 返回配对链接原文
interface Push {
  permission(): Promise<"granted" | "denied" | "prompt">;
  register(): Promise<{ token: string; environment: "production" | "development" }>;
  onOpen(handler: (payload: PushOpen) => void): void;          // 用户点开通知
}
interface Lifecycle { onActive(fn: () => void): void; onBackground(fn: () => void): void }
```

## 仓库结构与构建

| 路径 | 内容 |
| --- | --- |
| `clients/gui/packages/remote-client/`（新增） | 从 `renderer/remote-web/` 抽出的协议客户端、命令状态、会话状态；不导入 DOM、IndexedDB 或 Capacitor；存储通过 `KeyStore` 注入 |
| `clients/gui/renderer/mobile.html`、`clients/gui/renderer/src/mobile/`（新增） | App 的 Web 入口与页面；Vite 新增一个 `mobile` 构建入口，输出到 `clients/gui/dist/mobile/` |
| `clients/mobile/ios/`（新增） | Capacitor iOS 工程；`webDir` 指向上面的构建输出；本地 Swift 插件 `ArealKeychain` |
| `services/remote-relay/src/push.mjs`（新增） | APNs HTTP/2 客户端（Node 内置 `http2` 与 `crypto` 签 ES256 JWT，不加依赖） |

约束：

- Capacitor 与插件锁定精确版本，只用官方 `@capacitor/core`、`@capacitor/ios`、`@capacitor/app`、`@capacitor/push-notifications`、`@capacitor/barcode-scanner`。钥匙串用仓库内约 100 行的 Swift 插件实现，不引入第三方安全存储插件。
- 现有 PWA（`remote.html`）继续按原样构建和测试，v1 抽包后它改为从 `remote-client` 导入，行为不变。
- 签名证书、描述文件、APNs `.p8` 密钥、App Store Connect 凭据都不进仓库。Bundle ID 写成配置项，默认占位 `[BUNDLE_ID]`。
- App 不注册 Service Worker。`mobile.html` 设置严格 CSP：`script-src 'self'`，`connect-src` 只允许 `wss:`，禁止第三方脚本。

第一个 PR 必须先验证一件事：`@chainsafe/libp2p-noise` 依赖的 WebCrypto 和随机数在 WKWebView 的 `capacitor://localhost` 下可用，并能完成一次真实 Relay 握手。若不可用，停下报告，不要自行替换加密库。

## 配对与连接

### 配对链接

电脑端 `remoteControl.pair({transport:"relay"})` 已生成链接 `https://<relay-origin>/#host=<hostPin>&invite=<64 hex>&room=<64 hex>`，有效 120 秒、一次性。App 不改这个格式。

1. 首次打开 App 显示“连接电脑”页：主按钮“扫描配对二维码”，次按钮“粘贴配对链接”。说明文字：“在电脑的「设置 → 手机连接」里选择 Relay，生成配对二维码。”
2. 解析链接：origin 必须是 `https:` 且不带路径、用户名、端口以外的内容；fragment 用 `remoteLocator` 校验 `host` 与 `room`，`invite` 必须是 64 位十六进制。解析后立刻从内存里丢掉原始链接字符串，邀请秘密只保存在本次配对流程的变量里，不写日志、不写钥匙串。
3. 用 Relay origin 构造 `wss://<relay-host>/remote/socket`（与现有 Relay 客户端相同的路径），交给 `createRemoteWire(socket, {room})`，再走现有 Noise 握手。对端公钥与 `host` 不一致时中止，不发送邀请。
4. 校验通过后在 hello 里发送 `inviteSecret`，`clientKind: "ios"`（新增字段，见下文），显示名默认取 iOS 设备名（如“sailfish 的 iPhone”），可在配对前修改。
5. 收到 `pairing` 后显示“请回到电脑确认”和本机完整指纹，提示逐字核对。电脑端选择项目与 Observer/Operator 预设并确认，保存成功后返回 `ready`。
6. 收到 `ready` 后把设备私钥、Host pin、Relay origin、room、grant revision 原子写入钥匙串。写入失败要明确报错，并提示“本次可以使用，但下次需要重新配对”。

v1 默认“记住此设备”，不再提供“仅本次使用”选项：App 是个人设备上的安装，钥匙串比浏览器存储强。钥匙串项使用 `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`，不参与 iCloud 同步或备份迁移。

### 连接生命周期

- App 进入前台：读钥匙串 → 建 Relay 连接 → Noise 校验 Host pin → hello（不带邀请）→ `ready` → 拉 `project.list` 与当前页面需要的数据 → 若有待核对 `commandId`，只调 `command.read`。
- App 进入后台：主动关闭 WebSocket、释放订阅、保留草稿在内存。不申请后台保活。
- 断线重连沿用现有规则：0.5 到 30 秒带抖动退避；授权变更、协议不兼容、`AUTH_REVOKED` 停止自动重试并显示原因。
- 连接状态显示在项目页顶部：“已连接 · 可操作 / 仅查看”“正在连接…”“电脑离线”“授权已撤销，请重新配对”。“电脑离线”不能显示成任务停止。
- 设置页提供“清除此设备”：先断开连接，再清空钥匙串，并提示还需在电脑上撤销授权。

### Relay 改动：允许 App origin

现有 Relay 校验 client 的 `Origin` 必须在 `allowedClientOrigins` 中，并且协议必须与 `publicOrigin` 相同（https）。WKWebView 从 `capacitor://localhost` 发起连接，会被拒绝。

新增配置 `allowedAppOrigins`（字符串数组，默认空），只接受精确值，v1 文档示例为 `["capacitor://localhost"]`。校验规则：值必须是 `scheme://host` 形式，scheme 不能是 `http`、`https`、`ws`、`wss`。WebSocket 升级（`relay.mjs` 的 `upgrade` 处理）和 client 角色注册两处的 Origin 检查，都改为命中 `allowedClientOrigins` 或 `allowedAppOrigins` 任一即可。

这不降低安全性：原生 App 的 `Origin` 本来就可以伪造，Relay 也从不把 Origin 当身份；Host 身份由 Noise pin 决定，权限由 DeviceGrant 决定。文档里要写明这一点。

## 功能与协议映射

所有方法都是现有 `areal.remote.v2` 方法，除非标注“新增”。写方法一律带 UUID `commandId`，首次提交前生成并随草稿保存；结果未知时显示“待核对”，只调 `command.read`，不自动重发。

| 页面 / 操作 | 方法 | 说明 |
| --- | --- | --- |
| 项目列表 | `host.describe`、`project.list` | 每个项目卡片显示名称和摘要：运行中数量、待处理数量、最近更新时间。摘要来自 `work.list` 第一页（`filter: all`），只对在线项目请求 |
| 项目内会话列表 | `work.list`（`filter: all`，30 条/页） | 每行：标题、状态、时间。状态从 `execution` 与 `attentionRefs` 推出（见下表）；`kind: taskRun` 显示为 Task 行，点开进 Task 详情 |
| 打开会话 | `session.open`、`session.history`、`subscription.close` | 一个前台会话；离开页面或进入后台时 `subscription.close` |
| 新建会话 | `session.create` → 可选 `session.control(configure)` → `session.send` | 见下方顺序说明 |
| 发送消息 | `session.send` | 空闲时直接发送；运行中带 `enqueue: true, expectedTurnId` 追加到队列 |
| 停止当前轮 | `turn.stop`（`expectedTurnId`） | Task 拥有的会话返回 `TASK_CONTROL_REQUIRED`，界面改为显示“暂停 Task”入口 |
| 模型、推理强度、权限 | `session.control`，`operation: configure`，`values` 为 `model`、`parameters`、`options` | 只在会话空闲时可改；运行中面板只读，显示“本轮结束后再调整” |
| 审批、同步提问 | `attention.list`、`attention.read`、`interaction.respond` | 审批必须先读到完整参数和 `argumentsDigest`，用户看过后才能批准 |
| Task 异步提问 | `task.question.read`、`task.question.reply` | |
| Task 暂停 | `task.read`、`task.pause` | 需要用户勾选“我已核对这个 Task” |
| 推送注册 | `device.push.register`、`device.push.unregister`（新增） | 见“推送通知” |

### 新建会话的顺序

用户在“新会话”页写好第一条消息并点发送时：

1. `session.create`（新 `commandId`）。成功得到 `threadId`。
2. 如果用户在面板里改过模型、推理强度或权限，调用 `session.control(configure)`，`expectedRevision` 取 `session.open` 返回的 `configRevision`。
3. `session.send` 发送第一条消息。
4. 跳到会话页。

任何一步结果未知时停在该步，显示“待核对”，不继续下一步。第 1 步成功、后续失败时，会话已存在，界面跳到该会话并保留草稿，让用户再点一次发送。Host 默认 Profile 绑定 Workflow 时 `session.create` 返回 `UNSUPPORTED_PROFILE`，提示“请在电脑上选择一个普通配置”。

### 会话状态如何显示

状态文字一律使用 `--color-foreground-subtle`，颜色只放在 7px 圆点上。

| 状态 | 条件 | 圆点 token |
| --- | --- | --- |
| 等你确认 | `attentionRefs` 非空 | `--color-status-attention` |
| 运行中 | `execution` 表示有活动 Turn 或 Run | `--color-status-running` |
| 失败 | 最近一轮失败 | `--color-status-error` |
| 结果待核对 | 本设备有未确认的 `commandId` | `--color-status-unknown` |
| 已完成 / 空闲 | 其余 | 不显示圆点 |

时间用 `sourceUpdatedAt`，为 null 时不显示，不能用当前时间代替。会话标题用 `title`，为空时显示“未命名会话”，不要从第一条提示词截取。

## 推送通知

推送只用来把用户叫回 App，不携带会话内容，也不承载任何授权。用户点开通知后，App 照常连接、读取最新状态，再显示对应页面。

### 端到端流程

1. **申请权限**：配对成功后，第一次进入项目页时用一张说明卡请求通知权限（“电脑上有任务需要你确认时提醒你”），不在首次启动就弹系统框。用户拒绝后，设置页显示“通知已关闭，可在 iOS 设置中开启”。
2. **注册**：App 拿到 APNs device token 后，在已认证的 Noise 通道里调用 `device.push.register`。token 变化时再调一次。
3. **Host 保存**：Gateway 把 token 写进该设备 DeviceGrant 的新字段 `push`，随 `remote.json` 加密保存。撤销设备、清除设备、`device.push.unregister` 时删除。
4. **Host 产生事件**：通知发送器发现需要提醒的事件（见下表），对每个已注册且当前没有活动连接的设备，经 Host 与 Relay 之间已有的 WSS 连接发送一条 `push` 消息。
5. **Relay 转发**：Relay 用管理员配置的 APNs 密钥签 JWT，调用 APNs HTTP/2 接口投递。Relay 不保存 token，也不记录通知内容。
6. **点开通知**：App 读取载荷里的 `projectId`、`threadId` 或 `attention` 引用，连接后打开对应页面；目标已不存在时回到项目页并提示“这项已处理或已过期”。

### 推送哪些事件

| 事件 | 触发条件 | 通知文字（固定） | 接收设备 |
| --- | --- | --- | --- |
| 新的待处理 | 授权项目中出现新的审批、同步提问或 Task 异步提问 | 标题“AReaL”，正文“电脑上有 1 项需要你确认” | 该项目已授权、含 `answer` 能力的设备 |
| 轮次完成 | 本设备提交的 `session.send` 所在轮次进入完成 | “你在手机上发起的会话已完成” | 发起命令的设备 |
| 轮次失败 | 同上，轮次失败或中断 | “你在手机上发起的会话没有完成” | 发起命令的设备 |

通知文字不包含项目名、会话标题、提示词或工具参数。同一项目 30 秒内的多条待处理合并为一条，正文改为“电脑上有 N 项需要你确认”，使用 APNs `apns-collapse-id`。设备当前有活动连接时不推送。

### Host 通知发送器（新增）

放在桌面后台 `RemoteControl` 旁，复用 `remote-work-overview.cjs` 的有界查询，不新建 Core 状态，不订阅全部历史。

- 只为“至少有一台已注册推送的设备被授权”的在线项目工作。
- 每 5 秒读一次该项目的 `attention` 摘要；发送器启动或项目上线后的第一次读取只建立基线，不发通知，避免重启后重复提醒。
- 以 attention 引用的原生身份去重；同一引用只提醒一次。
- 轮次完成事件以现有提交 journal 中本设备的 `session.send` 记录为准，观察到该 Turn 进入终态后发送一次，然后从待观察列表移除。
- Relay 未声明支持推送、未连接或返回限流时，丢弃本次通知并记录脱敏诊断，不重试堆积，不影响任何业务路径。

### 协议新增

`device.push.register`，能力要求 `observe`，必须带 `commandId`：

```json
{"id":"rpc-7","method":"device.push.register","commandId":"<uuid>",
 "params":{"platform":"apns","token":"<hex device token>","environment":"production"}}
```

- `token` 为 64 到 200 位十六进制；`environment` 只接受 `production`（TestFlight 使用生产 APNs）或 `development`（Xcode 调试）。
- 成功返回 `{registered:true}`。Relay 不支持推送时返回 `RESOURCE_UNAVAILABLE`，App 在设置页显示“这个 Relay 未开启推送”。
- `device.push.unregister` 无参数，删除本设备 token。

hello 新增可选字段 `clientKind: "web" | "ios"`，只用于电脑端设备列表的展示，不参与授权判断。`ready` 与 `host.describe` 的 `capabilities` 在 Relay 支持推送时增加 `push`。这些变更需同步更新 [Remote API](../api/remote-control.md) 的已实现边界与 C4 方法目录。

### Relay 新增

配置新增可选项（未配置即不支持推送）：

```json
"apns": {
  "teamId": "[TEAM_ID]",
  "keyId": "[KEY_ID]",
  "keyFile": "/etc/areal-relay/apns.p8",
  "bundleId": "[BUNDLE_ID]",
  "maxPerHostPerMinute": 60
}
```

- Host 的 `ready` 消息里 `limits` 旁新增 `push: true|false`，Host 据此决定是否向 App 公告 `push` 能力。
- 新增 Host 发出的外层消息 `{"type":"push","token":"…","environment":"production","collapseId":"…","kind":"attention|turnCompleted|turnFailed","count":1,"target":{…}}`。只接受已注册的 host 角色连接；`target` 只允许 `projectId`、`threadId`、`attentionRef` 三个不透明字符串字段。
- Relay 把 `kind` 映射成上面的固定中文文字，Host 不能传任意通知文字。
- JWT 每 50 分钟重签一次；APNs 返回 `410 Unregistered` 时，回给 Host `{"type":"pushResult","token":"…","status":"unregistered"}`，Host 删除该 token。
- 日志只记录时间、路由 ID、`kind` 和 APNs 状态码，不记录 token 全文和 target。

## 界面与 Design System

### 设计稿

画面以设计稿 [AReaL 手机端界面](https://claude.ai/artifact/JcRBzKWVyjbu1j7K8Fj4cQ) 为准，共 5 屏，已按 `@areal/ui` 浅色主题 token 对齐：

1. **项目**：顶部电脑名与连接状态，右上角设置；页面标题“项目”；项目卡片列表。
2. **项目内会话**：返回、项目名、全宽“新建会话”主按钮、“最近会话”列表、“查看更早的会话”。
3. **新会话**：空态说明“要在 <项目> 里做什么？”，底部 Composer，带模型和权限两个按钮。
4. **会话中**：顶部返回、标题、项目名与状态；消息流；底部 Composer，运行中时主按钮变成停止。
5. **模型与权限面板**：底部面板，含模型列表、推理强度三段、执行权限三项、“完成”。

设计稿没画、v1 需要补的页面：连接电脑（扫码/粘贴）、等待电脑确认、审批与提问详情、Task 详情与暂停、设置（设备信息、通知状态、清除此设备）、电脑离线和授权撤销的状态。这些页面用 `@areal/ui` 现有组件组合：审批用 `DecisionCard`，提问用 `QuestionCard`，状态反馈用 `FeedbackNotice`，设置行用 `SettingsRow` 与 `SettingsGroupCard`，按钮用 `Button`。

### Token 对照

设计稿中的每个值都对应下列 token。实现时只能引用 CSS 变量，不能写设计稿里的十六进制或 px 字面量。

| 用途 | Token |
| --- | --- |
| 正文、主按钮底色 | `--color-foreground`、`--color-primary`、`--color-primary-foreground` |
| 次要文字、状态文字 | `--color-foreground-subtle` |
| 卡片、选中行、面板内列表底色 | `--color-hover` / `--color-navigation-selected` |
| 分隔线 | `--color-border` |
| 用户消息气泡 | `--color-user-message`、`--color-user-message-text` |
| 选中勾 | `--color-brand` |
| 底部面板遮罩 | `--color-dialog-backdrop` |
| 状态圆点 | `--color-status-running`、`--color-status-attention`、`--color-status-error`、`--color-status-unknown`、`--color-success`（连接成功） |
| 圆角 | 卡片 `--radius-card`，列表行 `--radius-navigation`，主按钮 `--radius-control`，小按钮 `--radius-button`，气泡 `--radius-message`，Composer `--radius-composer`，胶囊 `--radius-pill`，底部面板 `--radius-overlay` |
| 字号 | 页面标题 `--text-fixed-page-title`，面板标题 `--text-fixed-section-title`，项目名 `--text-fixed-emphasis`，列表标题 `--text-fixed-control`，正文 `--text-fixed-body`，标签 `--text-fixed-label`，辅助 `--text-fixed-caption`，输入框 `--text-mobile-input-safe` |
| 字体 | `--font-sans`、`--font-mono` |
| 阴影 | Composer `--composer-shadow-light`，分段选中项 `--shadow-raised-control` |
| 间距 | `--spacing-inline`、`--spacing-field`、`--spacing-section`、`--spacing-panel` |
| 小标签字距 | `--tracking-wf-label` |

`--color-status-attention`（`--color-warning`）和 `--color-status-error`（`--color-destructive`）在白底上作文字对比度不够，只能用在圆点和图标上。深色主题直接使用 `themes.css` 现有的 `.dark` 值，跟随 iOS 系统外观。

移动端需要而 token 里还没有的数值，先加进 `packages/ui/tokens.json` 再使用，例如最小触控尺寸 44px（建议名 `--size-touch-target`）、底部面板把手尺寸。不在 App 的 CSS 里新增字面量。

### 遵循的设计系统规则

本节采用“设计系统优化方案”（借鉴 Raft：规则配测试、组件分层复用）中的规则。该方案尚未定稿，这里只取与 v1 直接相关、与现行规则不冲突的部分；方案定稿后若有变化，以定稿为准。

- **分层**：App 的页面属于 L4 页面层，只组合 L2 模式部件（`DecisionCard`、`ComposerSurface` 等）和 L3 领域组合（`Messages`、`ConversationComposer`）。页面 CSS 只负责布局，不能用选择器改 `.areal-*` 组件内部样式。需要不同外观时，给组件加变体或插槽，改动放在 `packages/ui`。
- **数值只来自 token**：页面与组件 CSS 不写 px 和颜色字面量；新的移动端组件 CSS 纳入现有 `literal-baseline.json` 检查。
- **下沉规则**：项目卡片、会话列表行如果 Remote Web 也要用，就做成 `packages/ui` 里的 L2 部件；只有 App 用就留在 `src/mobile/`。
- **文案**：所有界面文字走现有中英词条（`renderer/src/i18n/messages/`），不在组件里写死中文或英文。现在 Remote Web 写死的 “Projects”“Show more” 不要带进 App。

会话页的消息流与 Composer 直接复用 GUI 组件，因此“对话流与 Composer 重设计方案”落地后，App 自动获得同样的活动行、分组和占位文字，不在 App 里单独实现。在它落地之前，App 的 Composer 占位文字按该方案使用：新会话“描述你要完成的事…”，运行中“补充要求，会在当前步骤后处理”。

### 移动端交互约定

- 触控目标不小于 44×44pt；输入框字号不小于 16px，防止 iOS 聚焦时页面放大。
- 页面使用 `env(safe-area-inset-*)` 避开刘海与 Home 指示条；Composer 固定在键盘上方。
- 列表支持下拉刷新；会话页滚到顶部自动加载更早历史（`session.history`）。
- 返回用左上角按钮和 iOS 边缘右滑手势。
- 文字遵守现有无障碍规则：图标按钮有 `aria-label`，状态变化用 `role="status"` 播报。

## 安全

- 网络可达或扫到二维码都不等于授权；授权只来自电脑端本机确认。App 不保存也不发送任何 Core 或桌面凭据。
- 邀请秘密只在本次配对的内存里存在，不写日志、钥匙串或崩溃报告。App 不接入第三方分析或崩溃收集 SDK。
- 推送载荷不含业务内容；通知上不提供批准按钮，审批必须进入 App 查看参数后完成。
- 撤销授权后，App 在下次连接收到 `AUTH_REVOKED`，清空本地会话投影，提示重新配对；钥匙串里的设备身份保留到用户选择“清除此设备”。
- 配对页和授权确认页继续提示“这台手机可以看到所选项目内的会话内容，并可以通过 Agent 使用当前执行权限”。

## 实施顺序（PR 切片）

每个 PR 单独可合并，并同步更新对应文档。

| # | 内容 | 完成标准 |
| --- | --- | --- |
| 1 | Capacitor iOS 空壳 + WKWebView 内 Noise 握手验证 | 模拟器里对本机严格 TLS 的 Relay 夹具完成一次 `hello`/`ready` |
| 2 | 抽出 `@areal/remote-client`，PWA 改为从包导入 | 现有 `test:remote-*` 全部通过，PWA 行为不变 |
| 3 | Relay `allowedAppOrigins` | `services/remote-relay` 测试覆盖接受与拒绝；部署文档更新 |
| 4 | 钥匙串插件、扫码、粘贴链接、配对与等待确认页 | 真机扫码配对成功；杀掉 App 重开无需重新配对；清除设备后需重新配对 |
| 5 | 项目页、会话列表、会话页（只读） | 能看到授权项目与会话，打开会话能看到历史与实时更新 |
| 6 | 新建会话、发送、排队、停止、模型面板 | 按“新建会话的顺序”完成；结果未知时只查不重发 |
| 7 | 审批、提问、Task 提问与暂停 | 手机上批准后，电脑上 Turn 继续执行 |
| 8 | 推送：协议方法、Host 通知发送器、Relay APNs 转发、App 注册与点开处理 | 见验收第 7、8 条 |
| 9 | TestFlight 打包说明与验收记录 | 内测用户能从 TestFlight 安装并完成全部验收 |

## 验收

用真实 iPhone（TestFlight 包）、真实自建 Relay（公网 HTTPS）和一台运行桌面后台的电脑验收，记录源码提交、iOS 版本、Relay 版本。模拟器和本机夹具只作开发证据，不能代替这里的结果。

1. 电脑生成 Relay 配对二维码，App 扫码，电脑核对指纹并授权两个项目（Operator），App 显示这两个项目。
2. 强制退出 App 再打开，无需重新配对即可连接。
3. 在项目内新建会话，选择非默认模型，发送第一条消息；电脑端看到同一会话、同一模型。
4. 会话运行中追加一条消息，它进入队列，本轮结束后执行；运行中点停止，电脑端该轮停止。
5. 打开电脑上已有的会话，历史可以向上加载；电脑端产生的新消息实时出现在手机上。
6. Agent 发起审批，手机上看到完整参数并批准，电脑端继续执行；拒绝时电脑端得到拒绝结果。
7. 手机锁屏，电脑端出现新审批，10 秒内收到通知；点开直接进入该审批。通知正文不含项目名和内容。
8. 手机在 App 内时不收到推送；电脑端撤销该设备后，再出现审批不再推送，App 下次连接提示授权已撤销。
9. 断开电脑网络，App 显示“电脑离线”；恢复后自动重连，未确认的发送显示“待核对”并能查到结果，没有重复发送。
10. 深色模式下所有页面可读，颜色来自 token；`literal-baseline.json` 检查通过。

## 假设与待确认

- 设计系统部分采用了“设计系统优化方案”和“对话流与 Composer 重设计方案”中的分层、token 和占位文字规则；两份方案尚未定稿，若定稿内容不同，以定稿为准。
- 组织有 Apple Developer 团队，能在 Relay 上配置自己的 APNs 密钥，并以自己的团队签名发布 TestFlight 包。
- 一个 App 安装只记住一台电脑。需要切换电脑时先清除设备再重新配对。
- 模型列表来自电脑端会话快照里的模型目录，App 不维护自己的模型列表。
