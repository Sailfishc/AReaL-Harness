**中文** | [English](t3code-borrowing-spec.en.md)

# 借鉴 T3 Code：受理记录、定时任务与仓库 lint 插件实施规格

## 结论

本规格把 [T3 Code](https://github.com/pingdotgg/t3code/tree/f41518f3bc2672c419871c02a3c6728d0f627142) 中三个可直接迁移的设计落到 AReaL-Harness，拆成三个互相独立的工作包，每个工作包一个 PR：

| 工作包 | 要解决的问题 | 借鉴的 T3 设计 |
| --- | --- | --- |
| A. 创建类请求的受理记录 | 新建会话等请求在 Core 重启或断线后长期显示“待核对”，界面无法给出结论 | 命令先写回执再执行；进程丢失后按动作类型结算，不留无终点的状态 |
| B. 定时任务的停放运行 | 上一轮运行一旦暂停或阻塞，后续触发全部被跳过 | 一次触发只负责把工作交给会话；会话的后续状态不阻塞下一次触发 |
| C. 仓库内 oxlint 插件 | 设计和工程约定靠文档和独立脚本维护，改动时不一定被检查 | 仓库内自定义 lint 规则，每条规则带测试，豁免必须写原因 |

建议顺序是 A、C 并行，B 先交设计说明，经维护者确认后再写代码。本文中的新方法、字段、状态和目录都是提案，实现并通过验收之前不能在其他文档中写成已支持能力。

对照基线：T3 Code `f41518f3`，AReaL-Harness main `1d61188`。只做了静态源码对照，没有运行两个应用。

## 交给 Codex 的方式

每个工作包单独开一个 Codex 任务，提示词只需要四段，正文引用本文对应小节，不要把本文整段复制进去：

```text
目标：实现 docs/development/t3code-borrowing-spec.md 的工作包 A。
上下文：该小节的“现状”和列出的文件；仓库规则见 AGENTS.md。
约束：该小节的“约束”和“需要停下来问的情况”。
完成条件：该小节的“完成条件”全部满足，并在 PR 中给出证据。
```

- 推理强度：A、B 用 high，C 用 medium。
- B 先用 Plan 模式，只产出设计说明（写在 PR 描述或 `PLANS.md` 中），给维护者确认后再实现。
- 仓库已有的通用规则（分层、中英文文档配对、测试分层、PR 模板、Agent 改进门禁）以 AGENTS.md 为准，本文不重复。
- 每个工作包内，可回退、只影响本工作包范围的实现选择由 Codex 自行决定，并在 PR 中说明理由。只有下文“需要停下来问的情况”需要先问。

## 工作包 A：创建类请求的受理记录

### 目标

任何带 `requestId` 的写请求，在 GUI 询问 Core 时都能得到明确结论，不再出现永远停在“待核对”的条目。

### 现状

- 管理类写请求已有持久受理日志：`core/engine/src/desktop/submissions.rs` 把记录写入 `desktop/submissions.json`，先落盘再执行；重启时 `accepted` 改成 `unknown`；落盘失败标 `unconfirmed`。这部分思路与 T3 的命令回执一致，应当保留并复用。
- 创建类请求（`areal/thread/start`、`areal/thread/fork`、`areal/side/start`、`areal/side/create`）不走这份日志。回执写在新会话自身的 `DesktopState.receipts` 中（`core/engine/src/desktop/state.rs` 的 `create_configured`）。如果 Core 在会话落盘前退出，任何地方都没有这条请求的记录。
- `find_request`（`state.rs:1252`）按 requestId 查找时，逐个锁住所有会话扫描回执。会话多时这一步会变慢，也会和正在运行的会话抢锁。
- GUI 侧 `clients/gui/app/src/core/submission-recovery.cjs` 的约定是：找不到回执就保持 UNKNOWN，永不重发。第 238 行注释写明“创建类没有公开的 Core 回执查询”。这些 UNKNOWN 条目会出现在插件页等与它无关的位置。

### 要达到的行为

`areal/request/read` 对一个 `(identity, requestId)` 返回下列结论之一。字段名和编码由实现决定，语义必须一致：

| 结论 | 含义 | GUI 的处理 |
| --- | --- | --- |
| 已完成 | 有结果；创建类带新会话 ID | 移除待处理条目，按结果刷新 |
| 已拒绝或失败 | Core 明确没有执行或执行失败，带原因 | 在发起位置显示原因，条目结束 |
| 执行中 | 当前 Core 进程受理了，还没结束 | 继续等待 |
| 已中断 | 之前的 Core 进程受理后退出，且 Core 能确定副作用没有发生（例如会话从未创建） | 显示“Core 重启时中断，未创建会话”，提供“重新发起” |
| 未受理 | 受理日志中没有这条记录 | 允许用**原 requestId** 重发；重发由受理日志保证幂等 |
| 无法确定 | 之前的进程受理后退出，Core 无法确定副作用是否发生 | 只在该条目自己的位置显示，提供“我已核对，移除” |

“已中断”就是 T3 对“进程丢失后不可重放动作”的处理：写明原因并结束，不自动重试。对创建类请求，Core 启动时检查日志中未完成的记录：对应会话存在就补成“已完成”，不存在就结算为“已中断”。

### 约束

- 受理记录必须在任何副作用之前持久化。这是“未受理”这个结论成立的前提。
- 受理日志在部署生命周期内不淘汰记录；容量用满时拒绝新请求（现有管理日志的行为），不能静默丢弃旧记录，否则“未受理”会变成误判。
- 现有 `submissions.json` 和会话内 `receipts` 必须能原样加载。旧会话里的回执继续可查。
- 查询按 requestId 直接定位，不再逐个锁住所有会话。
- GUI 只有在本次发送的传输调用已经结束（成功、失败或超时）之后，才能把“未受理”当作结论；请求还在途中时继续等待。
- 待处理条目只在发起它的界面位置显示，例如新建会话的条目显示在会话列表，不出现在插件页或全局横幅。
- 协议变更同步更新 Rust 协议类型、生成的 schema、`docs/api/core.md` 和 GUI 合同类型。

### 需要停下来问的情况

- 发现某个创建类方法在会话落盘之前就产生了外部副作用（例如启动了进程或写了工作区），导致无法区分“已中断”和“无法确定”。
- 需要改变现有管理日志的容量、格式或重启语义。

### 完成条件

- Core 测试覆盖：受理后、会话落盘前退出 → 重开后得到“已中断”；会话已落盘 → 得到“已完成”并带会话 ID；从未发送过的 requestId → “未受理”；“未受理”后用同一 requestId 重发 → 只创建一个会话；同一 requestId 不同参数 → 冲突（保持现有行为）。
- 反例验证：临时把受理记录的写入挪到副作用之后，上面至少一个测试失败。在 PR 中写明这一步做过以及失败的是哪个测试，然后恢复。
- GUI 测试覆盖六种结论的映射，以及“请求在途时收到未受理不结束条目”。
- 用旧版本数据目录（包含 `submissions.json` 和带回执的会话）启动，查询结果与升级前一致。
- 插件页不再出现与插件无关的待核对条目。

## 工作包 B：定时任务的停放运行不再阻塞后续触发

### 目标

某一轮运行暂停或阻塞后，后续触发照常进行。只有上一轮确实在执行或在等用户回答时，才跳过本次触发。

### 现状

- `core/protocol/src/tasks.rs:86` 的 `Overlap` 只有 `Skip`。
- `core/engine/src/task_mode/schedule.rs:531` 只要最后一轮不是终态就记 `SkippedOverlap`。`Paused` 和 `Blocked` 都不是终态。
- `desktop_schedules.rs` 中，运行期间 Host 断开会把 Goal 暂停，并记原因 `hostUnavailable`。因此 GUI 断开一次，该任务后续每次触发都会被跳过，直到用户手动恢复或取消。
- 每轮运行已经用确定的 `requestId`（`schedule-thread-{run.id}`，`desktop_schedules.rs` 约 303 行）新建自己的会话。这与 T3 用 `scheduled-task:{id}:{时间}:{trigger}` 作为命令 ID 的做法一致，应保留。

### 要达到的行为

- 下一次触发到期时，如果最后一轮处于停放状态（暂停或阻塞，没有正在进行的轮次，也没有待用户回答的交互），Core 把它结束为终态，原因写明“被下一轮替换”，然后照常受理新一轮。被替换那一轮的会话保持原样，用户可以把它当普通会话继续使用。
- 最后一轮处于执行中、排队中、等待用户输入或等待子 Agent 时，仍然跳过本次触发，行为与现在一致。
- 触发记录（`TriggerDecision`）能看出本次替换了哪一轮。
- Core 启动时，上次进程退出时仍标为执行中、但已经没有执行者的运行，不能继续显示执行中。它应转为带原因（例如 `coreRestarted`）的停放状态，交给上面的规则处理。
- GUI 的定时任务详情中，被替换的一轮显示原因，并能打开它的会话。

### 约束

- 同一个任务同时最多一轮在执行，这条不变。
- 现有持久化的任务和运行记录原样加载。如果实现选择新增 `Overlap` 取值而不是调整 `Skip` 的判定，已有任务也必须得到同样的修复，不能只对新任务生效。
- 不在本工作包中处理“GUI 未打开时触发”（需要机器级调度服务）和任务列表的读取性能（另有分支在改任务目录观察）。
- 界面文案走现有 i18n 词条，不硬编码中文。

### 需要停下来问的情况

- 设计说明完成后先停下，等维护者确认。说明里需要写清：用哪个终态表示“被替换”；`Skip` 的判定是直接调整还是新增取值；`coreRestarted` 运行的处理。
- 发现停放的运行仍持有工作区、进程或子 Agent 等资源，结束它会产生副作用。

### 完成条件

- Core 测试覆盖：上一轮暂停 → 下一次触发结束它并受理新一轮；上一轮阻塞 → 同上；上一轮执行中或等待用户回答 → `SkippedOverlap`；被替换那一轮的会话仍可读取和继续；Core 重启后无执行者的运行不再显示执行中。
- 反例验证：把停放判定临时改回“任何非终态”，替换相关测试失败。PR 中写明。
- 用旧版本任务账本启动，已有任务的下一次触发按新规则执行。
- 文档：`docs/api/core.md` 中任务运行状态和触发结果的说明同步更新。

## 工作包 C：仓库内 oxlint 插件

### 目标

在 `clients/gui` 建立仓库内的 lint 插件，用它承载能静态判断的设计和工程约定。第一批交付插件骨架和两条规则。

### 现状

- `clients/gui` 用 `vite-plus` 1.4.0，lint 由 `vp lint`（oxlint）执行，配置在 `clients/gui/vite.config.mts` 的 `lint` 段。T3 用的是同一版本，在 `lint.jsPlugins` 中挂载仓库内插件 `oxlint-plugin-t3code`。
- `pnpm --dir clients/gui check`（`scripts/check.mjs`）在本地和 CI 中只对改动文件运行 `vp check --deny-warnings`。新规则因此只约束本次改到的文件，不需要存量基线。
- 设计检查目前是独立脚本，例如 `scripts/a11y-lint.mjs`、`scripts/design-rules.mjs`。弹出层锚点检查 `popup-anchor-lint.mjs`（在 PR #10 分支上）检查的是 CSS，oxlint 不处理 CSS，所以它继续保持脚本形式，不迁移。

### 要达到的行为

- 插件目录、配置挂载和规则测试的结构参考 T3 的 `oxlint-plugin-t3code`（MIT 许可）。移植的代码保留版权声明，并更新 `clients/gui/THIRD-PARTY-NOTICES.md`。
- 规则 1：`require-suppression-reason`。任何 `oxlint-disable`、`eslint-disable`、`@ts-expect-error`、`@ts-ignore` 都必须写原因。可从 T3 移植。
- 规则 2：禁止在 `renderer/src` 和 `packages/ui/src` 中直接 `new ResizeObserver`，改用共享的尺寸观察工具（目前不存在，需要新增在 `packages/ui`）。现有约 28 处直接调用。T3 给出的理由是：React 在原生 ResizeObserver 回调里设置的状态晚一帧提交，导致布局跳动，这与我们历史会话抖动、弹出层漂移是同一类问题。实现前先在我们的 React 19.2 环境中写一个最小测试确认这个现象。如果复现不了，不做这条规则，改从 `clients/gui/design-system` 中挑一条已有的、能静态判断的“必须”规则，并在 PR 中说明替换理由。
- 每条规则的报错信息说明原因和替代写法；对应设计规则 ID 的，在报错里写上 ID。
- 规则启用后，对应的设计规则正文改为指向这条 lint 规则，避免两处各写一份。

### 约束

- 只对改动文件生效，沿用 `check.mjs` 的现有行为。不要为存量违规批量改代码或加豁免。
- 插件只用 oxlint 插件 API，不引入 ESLint 运行时。

### 需要停下来问的情况

- `vite-plus` 1.4.0 在我们仓库中无法加载仓库内插件，需要升级工具链或改动 `check.mjs` 的调用方式。

### 完成条件

- 每条规则有合法和违规两类用例的测试，并接入 `clients/gui` 现有测试命令。
- 反例验证：在一个改动文件里故意写入违规代码，`pnpm --dir clients/gui check` 失败并指出规则名。PR 中附上输出。
- `docs/development/` 中的开发指南说明如何新增一条规则。

## 不在本规格内

- 事件溯源和完整 Outbox 架构。T3 的中央协调文件 `Orchestrator.ts` 有 12,839 行，我们只借上面几条不变量。
- 在 GUI 中引入 SQLite。真相应留在执行一方（Core）。Core 存储改造另行评审。
- 手机端共享连接运行时（单一重连负责人、传输状态与数据新鲜度分开）。这些约束应补进 iOS 遥控端 v1 规格（`docs/development/ios-remote-v1-spec.md`，尚在评审中）的 `remote-client` 包说明，不在这里实现。
- 本地快检复用 `scripts/ci-scope.py`、模型注入内容的字节预算测试、测试中禁止真实时间等待。这几项价值明确，但优先级低于上面三项。

## 依据

T3 Code 源码（固定提交 `f41518f3`）：

- 命令回执与事务：[`EventSink.ts`](https://github.com/pingdotgg/t3code/blob/f41518f3bc2672c419871c02a3c6728d0f627142/apps/server/src/orchestration-v2/EventSink.ts)、[`CommandReceiptStore.ts`](https://github.com/pingdotgg/t3code/blob/f41518f3bc2672c419871c02a3c6728d0f627142/apps/server/src/orchestration-v2/CommandReceiptStore.ts)
- 进程丢失后的结算：[`EffectOutbox.ts`](https://github.com/pingdotgg/t3code/blob/f41518f3bc2672c419871c02a3c6728d0f627142/apps/server/src/orchestration-v2/EffectOutbox.ts)（`REPLAY_SAFE_EFFECT_TYPES_AFTER_PROCESS_LOSS`）
- 定时任务：[`ScheduledTaskService.ts`](https://github.com/pingdotgg/t3code/blob/f41518f3bc2672c419871c02a3c6728d0f627142/apps/server/src/scheduledTasks/ScheduledTaskService.ts)（`runDueTasks`、启动结算、`releaseStuckRun`）、[`Schedule.ts`](https://github.com/pingdotgg/t3code/blob/f41518f3bc2672c419871c02a3c6728d0f627142/apps/server/src/scheduledTasks/Schedule.ts)
- lint 插件：[`oxlint-plugin-t3code`](https://github.com/pingdotgg/t3code/tree/f41518f3bc2672c419871c02a3c6728d0f627142/oxlint-plugin-t3code)、[`vite.config.ts`](https://github.com/pingdotgg/t3code/blob/f41518f3bc2672c419871c02a3c6728d0f627142/vite.config.ts) 的 `lint.jsPlugins`
