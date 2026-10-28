**中文** | [English](t3code-quality-design.en.md)

# 借鉴 T3 Code：可测试性、可靠性与研发效率补充设计

## 状态与实现边界

本设计承接“受理记录、定时任务与仓库 lint 插件”规格的 A/B/C 工作包。D–I 的最小实现已落到现有测试、夹具和快检入口；J 落到 Renderer 导航派生缓存与阅读状态所有者。已运行证据与仍需原生验收的部分分别列出。

T3 参考源码固定为 `93a9e079b107a13b0c312920b917b5f61a8f720c`。AReaL 沿用 Rust Core/Runtime、真实 HTTP 适配器、Desktop 投影、测试清单和固定产物验证流程。协议回放只替代外部模型；Renderer 派生缓存不参与权威会话状态和写请求结算。

| 工作包 | 当前实现 | 已运行证据与边界 |
| --- | --- | --- |
| D. Provider 协议回放 | 版本化 JSON、真实 HTTP 字节、出站字段检查、暂停与断连 | D/E 的 HTTP、回放和超时合计 23 项通过；真实 Runtime 写入恢复固定槽 1 项通过 |
| E. 可控时序 | 请求到达/放行里程碑、ResponseDeadline 虚拟时间测试 | 上述 23 项及 1 项虚拟时间测试通过；保留真实 HTTP 时间边界 |
| F. 投影一致性 | 缺帧关闭、重连全量基线、旧连接隔离、历史释放 | 7 项 Desktop 本地传输测试通过；不覆盖手机或 Relay |
| G. 本地影响范围快检 | CI 范围与 manifest 复用、计划说明、输入变化失效 | 11 项临时 Git 合同及 5 项 manifest 测试通过；完整快检结果依赖所选环境条件 |
| H. 代表性历史夹具 | 旧格式长历史、已结算子会话、三种终态及 profile 断言 | 真实 Electron/Core 验收通过；40 Turn 读取 1 个旧页，来源与读取中副本不变，模型请求为零 |
| I. 模型输入体积基线 | 默认 Desktop 无 Runtime/插件 profile 的分项字节基线 | 1 项真实 Engine/HTTP 测试通过，包含独立实例对照及输入增减反例 |
| J. GUI 派生与阅读缓存 | 不可变输入缓存、侧栏非原地排序、32 项内存上限 | Chrome 计算次数/新快照验证及 4 项阅读缓存测试通过；完整旧对话流场景仍有定位器失败 |

D/F/H 补充协议故障、观察链和历史数据形态；E/G/I 深化时间控制、快检与上下文预算。J 以实际重算与容量证据选择最小修复。各项入口和证据不能互相替代，也不直接证明整体 Agent 能力、实际费用或用户感知延迟改善。

## D. 在真实 Provider 适配器边界回放协议

**T3 依据。** `packages/provider-testing/src/replayTranscript.ts` 解析带元数据的 NDJSON，并将工作区占位符实例化；`replayGate.ts` 提供 `waitForReached/release`；`ProviderReplayHarness.ts` 将回放适配器接入真实编排和持久化服务。恢复测试还把持久状态带入后续运行。见[协议回放](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/packages/provider-testing/src/replayTranscript.ts)、[检查点](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/packages/provider-testing/src/replayGate.ts)、[恢复测试](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/apps/server/src/orchestration-v2/testkit/OrchestratorReplayRecovery.integration.test.ts)。

**实现。** [http_replay.rs](../../core/engine/tests/support/http_replay.rs) 读取版本化 JSON，声明 ChatCompletions 协议和合成来源，按 JSON pointer 检查必要出站字段，再发送指定 HTTP 字节。响应可在请求已到达时停放，或声明比实际发送更多的 Content-Length 复现传输截断。`request(index)` 与 `release(index)` 控制先后顺序；场景结束核对脚本消费，失败或 Drop 清理自有服务任务。

[provider_replay.rs](../../core/engine/tests/provider_replay.rs) 经生产 HttpModel/decoder、Engine 和临时存储验证：同一 chunk 中错误前的文本保留；finish_reason 后断流不放行工具；取消后迟到回答不会改变已持久化的 Interrupted 状态。原 `http_model.rs` 的两项测试迁入该入口，场景数据位于 `tests/fixtures/provider-replay`。

真实 Runtime 场景以 `test-support` feature 显式选择：完成文件工具写入并独立核对持久记录，下一次模型请求断连，再重新打开 Engine；哨兵内容与工具结果数量检查已完成写入没有重放。它要求 `AREAL_TEST_BIN_DIR` 指向同批已验证固定 bundle，固定槽原生用例 1 项已通过，覆盖正常关闭旧 Engine 后重开；运行中进程崩溃不在此证据内。完整与截断脚本各有预期，回放通过不代表真实供应商兼容性或安装包通过。

## E. 用里程碑控制顺序，用虚拟时间验证策略

**T3 依据。** [DeterministicRuntime.ts](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/apps/server/src/orchestration-v2/testkit/DeterministicRuntime.ts) 提供 TestClock 和固定随机种子；回放 gate 区分“到达”和“释放”。[ThreadSettlementService.test.ts](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/apps/server/src/orchestration-v2/ThreadSettlementService.test.ts) 通过 Deferred 和 TestClock 控制竞争。该仓库也存在轮询辅助代码，不能据此宣称其所有测试都已确定化。

**实现。** 取消场景使用回放请求到达通知，先等待 Turn 结算为 Interrupted，再释放迟到响应，并在新 Engine 实例中检查保存结果。该场景替代原依靠延迟响应头制造时间窗口的取消测试；网络 EOF 与持久化结果分别断言。

[watchdog.rs](../../core/engine/src/watchdog.rs) 的 `first_event_deadline_is_fixed_and_activity_starts_a_new_idle_window` 使用 Tokio 暂停时间，检查首事件绝对期限及 Activity 后新的 idle window。`model_timeouts.rs` 保留四项真实 HTTP 超时边界；虚拟时间仅控制策略计时，不假设 socket、Main、页面和系统 I/O 共用时钟。

运行 `cargo test --locked -p areal-engine --test http_model --test provider_replay --test model_timeouts`，以及 `cargo test --locked -p areal-engine --lib first_event_deadline_is_fixed_and_activity_starts_a_new_idle_window`。已通过结果为前者 23 项、后者 1 项；其中不含 feature 门控的 Runtime 场景。精确里程碑和定向错误断言用于解释失败，保留总期限，不能以重试后成功掩盖首跑失败。

## F. 补齐快照、增量和重连的一致性验收

**T3 依据。** [subscribeBeforeSnapshot.ts](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/apps/server/src/utils/subscribeBeforeSnapshot.ts) 有两种实现：共享 mutex 内先读快照再订阅，或无共享锁时先订阅再读快照；其[测试](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/apps/server/src/utils/subscribeBeforeSnapshot.test.ts) 在读取窗口中插入变化。[shell-sync.test.ts](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/packages/client-runtime/src/state/shell-sync.test.ts) 还检查旧异步保存、权威快照重置及缓存补全冲突。借鉴的是可执行的边界不变量，不能只照函数名复制顺序。

**实现。** 继续使用 [state-projection.cjs](../../clients/gui/packages/workbench/client/state-projection.cjs) 的 stream、sequence、delta base 约束及 ServiceConnection 的连接归属守卫，在 [desktop-projection-transport.test.mjs](../../clients/gui/scripts/desktop-projection-transport.test.mjs) 增加真实本地 WebSocket 观察场景。覆盖重复/旧帧不回退、缺失 base 导致连接关闭、新连接读取完整权威基线，以及旧连接迟到帧不能覆盖新连接。

现有背压合并、回执顺序和历史 acquire/release 的其他客户端隔离继续由同一入口保护。`node --test clients/gui/scripts/desktop-projection-transport.test.mjs` 共 7 项通过；恢复后的公开语义状态与服务快照核对，并检查没有自动重发用户写请求。

sequence 的重置仍绑定新 stream/reader，未照搬 T3 的低序号重置语义。这里的证据覆盖 Desktop 传输及投影，完整 Core 历史、手机与 Relay 各自执行专项验收；测试出现真实契约缺陷时才扩展生产修复范围。

## G. 与 CI 共用范围判断的本地快检

**T3 依据。** [check-changed.ts](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/scripts/check-changed.ts) 复用 CI 的 `decide/readWorkspace`，包含未提交和未跟踪文件，对受影响包及依赖方检查类型，并运行邻近测试；摘要明确列出留给 CI 的检查。通过缓存还会复核输入是否在运行期间变化。

**实现。** [check-changed.py](../../scripts/check-changed.py) 提供 `make check-changed CI_BASE=<ref>`；`ARGS=--plan` 仅输出 JSON 计划。入口解析一次 merge-base，纳入已提交、暂存、未暂存、未跟踪、删除及重命名两侧路径，输出输入摘要、命令、理由、命中路径与未覆盖项。暂存与工作区差量取并集，即使内容相互抵消也选检；输入摘要包含 cached diff，纯暂存区变化也会使证据失效。命令验收对象明确为 `working-tree`，部分暂存文件的 index 内容只参与选检与漂移检测。

`ciScopes` 原样复用 [ci-scope.py](../../scripts/ci-scope.py)；未知代码的本地扩大单列为 `conservativeFallback`，不冒充原 CI 已识别。GUI 通过 [test-manifest.mjs](../../clients/gui/scripts/test-manifest.mjs) 的 stdin JSON `--select-changed` 接口复用领域、平台和依赖条件，保留共享 unit 测试。共享 Rust/schema 保守执行 workspace 检查与 SDK 消费者检查，暂不推断精细 Rust 依赖图。

执行为顺序运行，无整轮通过缓存。所选命令成功也只报告 `passed-selected-checks`；缺条件为 `partial`，输入变化为 `invalidated`，失败为 `failed`，没有改动为 `no-changes`。`partial`、`invalidated`、`failed` 返回非零；E2E、原生桌面、真实供应商与安装包仍列为 deferred。11 项临时 Git 合同与 5 项既有 manifest 测试通过；隔离反例去掉未知代码的 GUI 扩大后，选择合同按预期失败。

## H. 将复杂历史做成可复用的开发与验收夹具

**T3 依据。** [migrate-dev-db.ts](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/apps/server/scripts/migrate-dev-db.ts) 以只读源建立隔离副本，选择停止的 Thread 家族，清除待执行工作及认证会话，再迁移和裁剪；[测试](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/apps/server/scripts/migrate-dev-db.test.ts) 验证来源/目标隔离和旧数据升级。价值在真实数据形态进入开发循环。

**实现。** [profiles.json](../../clients/gui/scripts/fixtures/history-compat/profiles.json) 声明合成来源、旧存储版本和语义预期：已结算子会话关系、40 Turn 的分页历史，以及 completed/failed/interrupted 三种终态。样本保留版本 14 的原始格式；[history-copy-smoke.mjs](../../clients/gui/scripts/history-copy-smoke.mjs) 复用原有私有副本与来源哈希核对，增加公开 history acquire/page 结果、顺序、关系、终态与 Renderer 可见文本断言。

入口仍为 `pnpm --dir clients/gui test:history-compat`，需要匹配的固定 Core 与已构建 GUI；`AREAL_CORE_BIN` 指定源码测试产物，包验收可显式选择 executable。只读 profile 保留 idle、无队列、无托管执行与零模型请求约束；活动恢复数据仍由 D/F 专项拥有。没有新增默认复制用户数据的开发启动行为。

真实 Electron/Core 验收已通过：40 Turn 样本实际加载 1 个旧页，子会话关系、三种终态与可见文本一致；来源及读取中的副本摘要不变，模型请求为零，隔离服务正常退出。合成样本不能覆盖全部真实用户数据，显式本地副本和安装包验收继续分别执行。

## I. 为静态模型输入建立分项体积基线

**T3 依据。** [AgentContextBudget.test.ts](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/apps/server/src/provider/AgentContextBudget.test.ts) 从生产构造函数及工具注册结果测量附加提示和模型可见工具字段的 UTF-8 字节，与版本化基线比较。

**实现。** [model_input_budget.rs](../../core/engine/tests/model_input_budget.rs) 经生产 `Engine::create_configured`、默认配置和真实 HTTP 适配器捕获求解请求；辅助命名由已有 SolveOnlyHttpModel 边界隔离。首个 profile 是 `desktop-default-no-runtime-or-plugins`，不把本机 Runtime 或第三方插件能力计入默认无宿主测试。

固定基线 [model-input-budget.json](../../core/engine/tests/fixtures/model-input-budget.json) 分别记录 system 指令 11,758 UTF-8 字节、Execution settings 段 563 字节，以及 18 个工具的 name/description/parameters 计量，模型可见工具函数 JSON 合计 12,686 字节。不同临时目录、ID 与用户正文的两次独立 Engine 请求计量一致。动态用户历史、Skills 正文、检索和媒体不纳入该固定 profile。

`cargo test --locked -p areal-engine --test model_input_budget` 的 1 项测试通过，包括增加/减少工具描述和增加 system 指令的反例；变化输出分项与工具名称，基线必须人工审阅更新。该检查不自动删提示、截断工具或改变生产预算。字节是确定性增长信号，不转换成未验证的 token、费用或成功率结论；Agent 行为修改仍遵循[改进方法](agent-improvement.md)。

## J. GUI 派生缓存与 Design System 连续性

用户操作跨越 Renderer 意图、Desktop 传输与投影、Core 权威会话、Runtime 副作用。改进循环是：定义可观察目标，追踪调用与状态所有权，以同一场景验证机制，实施最小修复，再检查结果。源码重复调用是候选证据；计算次数、缓存容量、数据新鲜度和用户交互分别验证，减少计算不自动等于感知延迟降低。

| 所有者 | 缓存或保留内容 | 更新与释放边界 |
| --- | --- | --- |
| Core / Runtime | 历史、受理记录、执行事实 | 沿既有持久化与生命周期合同；Renderer 缓存不参与写请求结算 |
| Desktop / workbench | 带 stream、sequence、base 的投影及有界历史页 | 按现有重连、基线校验和 view release 处理 |
| Renderer 导航 | 排序项目、会话目录和侧栏派生结果 | 完整不可变输入引用变化即重算，组件卸载释放 |
| Messages / readingViews | 按阅读 owner 隔离的布局与语义锚点 | 保存刷新最近访问顺序，超过既有 32 项边界淘汰最旧项 |
| Design System | 导航、阅读、返回与状态反馈约束 | 组件就近合同拥有规则，验收复用生产组件 |

`useSessionNavigation` 原先每次渲染都创建排序项目数组，`App` 随后重建全量目录；侧栏还原地排序输入摘要。选择先稳定上游项目引用，再缓存目录与侧栏派生，排序不修改输入。重命名、未读、运行状态、项目顺序及新权威快照必须及时刷新。缓存不按 Thread ID 长期保留业务对象，不掩盖 pending/UNKNOWN。

`readingViews` 原有 sessionStorage 上限为 32 项、65,536 字符，内存 Map 却不淘汰。隔离复现访问 1024 个 owner 后内存为 1024 项、持久化为 32 项，每次保存仍复制全部 Map。选择在原保存所有者按相同 32 项边界裁剪，即使存储不可用也限制容量。保留语义锚点，不保存 DOM、正文或 Core 历史。

后端历史已有视图、页数和字节限额。跨会话保留完整历史页会改变 release 与资源归属，当前证据不支持本轮引入。Messages 条目投影缓存保留为后续候选，需独立测量。

交互分类为 I-NAV、I-READ、I-RECOVER，子对话返回涉及 I-RETURN。复用 App、Sidebar、Messages 和现有 Token。约束引用[交互模式](../../clients/gui/design-system/interactions.md)的 NAV-CONTEXT-01、READ-CONTINUITY-01、RECOVER-TRUTH-01、RETURN-CONTEXT-01，以及 [Messages 合同](../../clients/gui/renderer/src/Messages.md)的 R-MESSAGES-004/005；本轮不新增设计规则或视觉角色。

同源 Renderer 夹具比较优化前后无关 UI 操作的目录重算次数，并检查新快照中的名称、未读、运行和排序即时更新。阅读缓存检查最近访问淘汰、存储不可用和语义锚点重载；主题、字号与布局变化沿既有阅读逻辑。截图、原始计数和未通过项分别记录；静态设计检查、Renderer 交互、Electron/Core 历史与安装包各自保留证据边界。


**已运行证据。** `pnpm --dir clients/gui test:navigation-cache` 在真实 React App/Chrome、fixture PlatformServices 边界测量相同无关 UI 操作：优化前 catalog 重算增量 13、projectVisits 156、comparisons 38,805，优化后均为 0；重命名、未读、运行状态、排序和新权威快照五类刷新通过。计数说明该场景减少了派生计算，不是端到端耗时或用户感知延迟结论。

`readingViews.test.ts` 的 4 项测试通过。Chrome 主题切换和重载检查的语义阅读锚点偏差为 1px；旧 `conversation-flow` 场景在 `.tool-summary-row .tool-failed` 定位器超时；生产折叠失败状态由 `ActivityRowStatus` 的 `data-tone="failed"` 表达。该 markup 与 `readingViews` 容量裁剪属于不同边界，本专项未修改旧 runner，完整对话流未计为通过。原生 Electron/Core 历史、平台输入和安装包仍保留各自验收边界。

## 验证入口与完成边界

具体操作见[测试指南](testing.md)。D/E/F/G/I 与 J 的局部机制证据已建立；Core HTTP/回放/超时与固定槽 Runtime 合计 24 项、虚拟时间 1 项通过，文本丢失和错误首事件期限的两个隔离反例均触发断言失败并恢复复验。匹配的 Core/GUI 构建、固定槽 doctor、GUI 类型、设计与格式检查通过。H 的真实 Electron/Core 合成历史专项通过；真实用户升级数据和安装包继续独立验收。未执行、失败和仅局部通过分别报告，不用测试总数代替覆盖范围。每个定向反例只在隔离环境或已捕获的测试请求边界注入，完成后恢复正式输入。
