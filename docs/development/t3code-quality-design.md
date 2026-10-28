**中文** | [English](t3code-quality-design.en.md)

# 借鉴 T3 Code：可测试性、可靠性与研发效率补充设计

## 状态与设计结论

本文是待评审的补充设计，承接已有“受理记录、定时任务与仓库 lint 插件”规格的 A/B/C 工作包。D–I 是候选工作包，尚未实现或验收；这里的目标行为不构成当前产品能力承诺。

源码对照：T3 Code `93a9e079b107a13b0c312920b917b5f61a8f720c`；AReaL-Harness HEAD `2d3c4b14183f54cbee8ba467cd023c94ab5f6005` 及分析时的工作区。AReaL 工作区存在受理恢复、任务界面、上下文等并行修改，因此本文对这些位置只描述已读到的机制，不判定相关工作包已经完成。依据是本地源码和测试静态阅读，未运行两个产品，也未测量提速或故障率。

优先借鉴的是把失败变成可重复的输入、可控制的时序和可核对的结果。沿用 Rust Core/Runtime、现有 HTTP 模型夹具、Desktop 投影和测试清单；Effect、SQLite 事件溯源和中央 Orchestrator 不作为迁移前提。

| 工作包 | 新增价值 | 首个切片 | 建议顺序 |
| --- | --- | --- | --- |
| D. Provider 协议回放 | 相同断流、分块和工具调用问题能离线重现 | 一个真实 HTTP 适配器、两类已有失败场景 | 第一批 |
| E. 可控时序 | 测试能精确进入竞态窗口 | 给 D 的取消场景补里程碑；迁移一个时间策略测试 | 随 D 实施 |
| F. 投影一致性验收 | 重连和历史加载不会悄悄恢复错误状态 | Desktop 同一条观察链上的缺帧与旧响应场景 | 第二批 |
| G. 本地影响范围快检 | 迭代时更快拿到相关检查结果 | 复用 CI 范围与 GUI manifest，输出选择理由 | 可与第一批独立推进 |
| H. 有代表性的数据夹具 | 开发环境与验收使用相同复杂数据形态 | 扩展现有 history-compat 的合成样本 | 第二批 |
| I. 模型输入体积基线 | 工具和系统上下文增长可解释、可检查 | 默认配置的静态指令和工具 schema 分项计量 | 后续小切片 |

D/F/H 是本次补充；E/G/I 深化原规格末尾已提出的时间控制、快检与上下文预算建议。F 与原规格提到的移动端连接设计相关，但这里只设计观察链验收，共享连接运行时仍由原专项拥有。

## D. 在真实 Provider 适配器边界回放协议

**T3 依据。** `packages/provider-testing/src/replayTranscript.ts` 解析带元数据的 NDJSON，并将工作区占位符实例化；`replayGate.ts` 提供 `waitForReached/release`；`ProviderReplayHarness.ts` 将回放适配器接入真实编排和持久化服务。恢复测试还把持久状态带入后续运行。见[协议回放](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/packages/provider-testing/src/replayTranscript.ts)、[检查点](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/packages/provider-testing/src/replayGate.ts)、[恢复测试](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/apps/server/src/orchestration-v2/testkit/OrchestratorReplayRecovery.integration.test.ts)。

**我们的基础。** [http_model.rs](../../core/engine/tests/http_model.rs) 已覆盖真实 HTTP 适配、分块、终止标记之后断流、采样参数和能力配置；[solve_only_http.rs](../../core/engine/tests/support/solve_only_http.rs) 已封装请求用途隔离。[history-smoke.mjs](../../clients/gui/scripts/history-smoke.mjs) 使用真实 Core/Runtime 和局部 SSE 模型。缺口是这些场景主要由各测试内的服务代码表达；可以试验把相同协议故障作为可复用输入资产保存。

**最小设计。** 在 `core/engine/tests/support/` 扩展现有 HTTP 测试支持，第一版只服务实际选择的协议。记录三类动作：核对出站请求的必要语义字段、发送指定入站字节、在标记点等待或断开。场景元数据包含协议版本、请求用途、合成或脱敏来源、预期终态。源数据经脱敏再入库；不在生产路径增加自动流量录制。

测试路径为“回放 HTTP 服务 → 生产 HttpModel/decoder → Engine → 真实临时存储”；需要检查工具副作用时再接入真实 Runtime。只有 HTTP 服务是替身，Engine 的恢复、持久化和工具结算仍走生产实现。适配器输入应保留原始字节边界，避免先归一化成正确事件而漏掉 decoder 错误。输出用语义断言，不冻结整段内部日志。

**验收。** 从现有测试选择“一个 HTTP chunk 中先有文本再有错误”和“finish_reason 后传输失败”两个案例，分别核对已观察文本、失败类型、工具是否获准执行。再加入同一脚本在工具结果持久化后断连的集成案例，核对工作区副作用次数、持久结果和恢复后的 Turn；重启必须启动新的 Engine/进程并复用隔离数据目录。完整记录与截断记录分别有明确预期，不能把不完整回放当成正常结束。定向反例是在隔离副本提前放行工具或丢弃已观察文本，相关断言必须失败。

**代价与边界。** fixture 会随供应商协议变化维护。先证明两个案例共享的数据格式足够，再决定是否给 GUI runner 读取同一数据；暂不建立跨语言执行框架。回放验证协议与恢复契约，真实供应商兼容性仍由专项测试验证。A 工作包拥有创建请求受理语义，D 不重新定义 UNKNOWN 的可重试条件。

## E. 用里程碑控制顺序，用虚拟时间验证策略

**T3 依据。** [DeterministicRuntime.ts](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/apps/server/src/orchestration-v2/testkit/DeterministicRuntime.ts) 提供 TestClock 和固定随机种子；回放 gate 区分“到达”和“释放”。[ThreadSettlementService.test.ts](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/apps/server/src/orchestration-v2/ThreadSettlementService.test.ts) 通过 Deferred 和 TestClock 控制竞争。该仓库也存在轮询辅助代码，不能据此宣称其所有测试都已确定化。

**我们的基础。** [model_load.rs](../../core/engine/tests/model_load.rs) 已使用 `start_paused` 和 `tokio::time::advance`；`http_model.rs` 已用 Notify 等待 Activity 后再放行终态。[model_timeouts.rs](../../core/engine/tests/model_timeouts.rs) 仍含真实 HTTP 等待；[desktop-projection-transport.test.mjs](../../clients/gui/scripts/desktop-projection-transport.test.mjs) 使用短间隔轮询等待 socket/历史释放。

**最小设计。** 由当前 fixture 暴露 `requestObserved`、`frameDelivered`、`resultPersisted` 等实际可观察里程碑，需要哪个就增加哪个。语义策略测试复用 Tokio 暂停时间；跨 socket 的集成测试用消息/通知等待具体事件。持久化里程碑必须在写入完成后发出，不能把模型服务“已发送响应”冒充 Core“已落盘”。本地无法观察时，优先走现有事件或测试依赖边界；新增测试钩子只在测试构建可用。

**验收。** 选一个取消场景，明确“请求到达 → 发起取消 → 释放迟到响应”，断言迟到结果不能复活已结束 Turn，且相关资源释放；选一个纯时间策略测试，在注册计时器之后推进到期限前后，核对只发生预期一次转换。等待事件保留总期限，超时作为失败诊断。反例为绕过迟到结果守卫，或错误移动超时起算点；对应测试必须失败。

**代价与边界。** 页面时钟、Main 计时器、Core 时间与系统 I/O 不共享一个虚拟时钟。真实 HTTP 超时测试可以保留少量墙钟用例。按修改涉及的测试逐步迁移，避免建立覆盖整个系统的 Clock 抽象或一次性禁用所有 sleep。收益用迁移前后同场景耗时、首跑失败与重试次数报告，不预设提速比例。

## F. 补齐快照、增量和重连的一致性验收

**T3 依据。** [subscribeBeforeSnapshot.ts](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/apps/server/src/utils/subscribeBeforeSnapshot.ts) 有两种实现：共享 mutex 内先读快照再订阅，或无共享锁时先订阅再读快照；其[测试](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/apps/server/src/utils/subscribeBeforeSnapshot.test.ts) 在读取窗口中插入变化。[shell-sync.test.ts](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/packages/client-runtime/src/state/shell-sync.test.ts) 还检查旧异步保存、权威快照重置及缓存补全冲突。借鉴的是可执行的边界不变量，不能只照函数名复制顺序。

**我们的基础。** [state-projection.cjs](../../clients/gui/packages/workbench/client/state-projection.cjs) 已校验 stream、sequence、delta base，重复/旧序号返回已有状态；Desktop 传输测试已有背压合并、命令回执顺序和历史释放隔离；[bounded-history-client.test.mjs](../../clients/gui/scripts/bounded-history-client.test.mjs) 与 [history-reobserve.test.mjs](../../clients/gui/scripts/history-reobserve.test.mjs) 已覆盖历史观察。第一步是核对覆盖矩阵，已有用例只增加必要断言。

**最小设计。** 在现有 Desktop 观察链测试中控制“订阅/快照交接、投影帧交付、旧历史请求完成”三个边界。比较的对象是公开状态中的项目/Thread 身份、Turn 状态、条目内容和历史可继续加载性；期望来自预先声明的业务结果或独立权威读取，不能由被测 encoder 自己生成全部预期。

| 注入场景 | 应验证的结果 |
| --- | --- |
| 首次快照与开始观察之间发生变更 | 变更出现在快照或后续通知中，不静默遗漏 |
| 重复帧、同一 stream 的旧帧 | 语义状态不重复应用或回退 |
| delta 缺少 base | 拒绝错误增量；所属连接恢复路径重新取得完整基线 |
| 新连接已建立，旧连接响应才返回 | 旧响应不能覆盖新连接状态；新 stream 用新的 reader/基线 |
| 释放历史视图后 load/acquire 才完成 | 该视图不再占用资源，其他客户端仍可读取 |

**验收。** 先在现有测试补缺，再选缺帧恢复场景跨真实本地 socket 验证最终公开状态与权威读取一致；同时核对没有重新发送用户写请求。反例为取消 base 校验或允许旧连接结果写入，矩阵中的相应案例必须失败。只有发现生产路径缺陷才修改生产代码，并按具体契约解释恢复动作。

**代价与边界。** sequence 是否可重置取决于 stream/连接身份，不能照搬 T3 的低序号权威重置规则。先验证 Desktop，Remote 复用语义用例时再增加自己的传输与权限验收；本地 socket 通过不代表手机或 Relay 已验收。

## G. 与 CI 共用范围判断的本地快检

**T3 依据。** [check-changed.ts](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/scripts/check-changed.ts) 复用 CI 的 `decide/readWorkspace`，包含未提交和未跟踪文件，对受影响包及依赖方检查类型，并运行邻近测试；摘要明确列出留给 CI 的检查。通过缓存还会复核输入是否在运行期间变化。

**我们的基础。** [ci-scope.py](../../scripts/ci-scope.py) 判断 GUI/release 大范围；[test-manifest.mjs](../../clients/gui/scripts/test-manifest.mjs) 已有领域选择及未知路径全量回退；[check.mjs](../../clients/gui/scripts/check.mjs) 已做改动文件静态检查；[Makefile](../../Makefile) 的 `ci-preflight` 已统一较完整的推送前检查。需要补的是适合日常迭代的选检计划，而非再建一个发布门禁。

**最小设计。** 新增薄的本地入口（建议名 `make check-changed CI_BASE=<ref>`，目前不存在），解析一次 merge-base，纳入已提交、暂存、未暂存、未跟踪及删除/重命名路径。调用现有范围判断和 manifest，输出每个选择的命令、命中路径、依赖条件与未覆盖项。GUI 内部领域选择继续归 manifest；Core/shared schema/工具链等共享边界采用宽范围，首版不推断精细 Rust 依赖图。

第一版只选检和执行，暂不缓存“整轮通过”。纯静态步骤可在输入准备完成后并行；读写相同构建产物或固定槽的步骤按依赖顺序执行。现有 `ci-preflight` 与 CI 仍执行各自要求的检查。

**验收。** 在临时 Git 仓库中验证普通源码、schema、锁文件、测试 runner、删除、重命名、未跟踪文件与未知路径；相同路径输入在本地和 CI 入口得到相同适用范围。共享 schema 必须选入消费者，未知代码路径不能输出“无需测试”，缺依赖明确失败或列为未执行，不能变成通过。执行期输入发生变化时报告证据失效。定向反例为漏掉一个共享路径映射，选择契约测试必须失败。

**代价与边界。** 维护的是已有 owner 的选择规则，避免另建一份路径白名单。只有选检正确性与实际耗时证明值得后，才考虑按源码、锁文件、工具版本、配置和产物身份缓存；不能只用 HEAD 作为 key。比较同一修改的快检与预检耗时，并保留各自覆盖范围。

## H. 将复杂历史做成可复用的开发与验收夹具

**T3 依据。** [migrate-dev-db.ts](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/apps/server/scripts/migrate-dev-db.ts) 以只读源建立隔离副本，选择停止的 Thread 家族，清除待执行工作及认证会话，再迁移和裁剪；[测试](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/apps/server/scripts/migrate-dev-db.test.ts) 验证来源/目标隔离和旧数据升级。价值在真实数据形态进入开发循环。

**我们的基础。** [history-copy-smoke.mjs](../../clients/gui/scripts/history-copy-smoke.mjs) 已支持合成 fixture 和显式本地来源，检查 idle、终态 Turn、无队列/托管执行，核对来源哈希，并以拒绝模型请求的服务验证只读历史。已有固定产物身份及隔离目录机制，见[测试指南](testing.md)。

**最小设计。** 沿用 `scripts/fixtures/history-compat` 与现有 runner，先增加小而有代表性的合成 profile：长历史/分页、分支与子任务关系、失败及中断终态。每份包含格式版本、语义预期与来源类别；迁移样本保留旧格式，不能先用新版本重新保存。GUI 开发预览和对应 smoke 消费同一份样本，确有第二个消费者后再提取共用加载代码。

只读历史 profile 继续满足已有静止约束。崩溃、待受理、暂停 Goal 等活动数据属于 D/F 的专用恢复 fixture，使用不同验收入口；不能为方便载入而把这些状态统一改成成功。真实本地副本仍需显式来源，首版不增加默认复制用户目录的启动行为。

**验收。** 旧格式样本经当前 Core 读取后，标题、Thread 关系、原始内容和继续分页一致；浏览历史时模型请求数为零，来源哈希不变。用真实 Renderer 检查长历史和分支可打开。每个 profile 关联所保护的不变量，反例是移除对应兼容分支或破坏历史引用后测试失败。

**代价与边界。** 合成数据不能证明所有真实升级都兼容；保留现有显式本地副本与安装包验收。以复现问题所需手工准备步骤减少、同一样本可重复载入为收益，不用 fixture 数量作为质量指标。

## I. 为静态模型输入建立分项体积基线

**T3 依据。** [AgentContextBudget.test.ts](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/apps/server/src/provider/AgentContextBudget.test.ts) 从生产构造函数及工具注册结果测量附加提示和模型可见工具字段的 UTF-8 字节，与版本化基线比较。

**我们的基础。** [request_budget.rs](../../core/engine/src/model/request_budget.rs) 已控制请求/媒体字节上限；[context.rs](../../core/engine/tests/context.rs) 已覆盖压缩和 token 限额；`http_model.rs` 核对实际请求的指令位置与工具 schema 稳定性。运行时超限保护和默认静态输入增长是两种不同问题。

**最小设计。** 在现有 HTTP 请求捕获测试中，从实际生产组装结果分别统计默认系统指令、内置工具 `name/description/parameters`、固定环境说明。按当前确有支持的协议与配置区分，首版仅默认配置；用户历史、用户 Skills 正文、动态检索内容和媒体单列，不纳入固定默认体积。将可审阅的计量基线放在测试资产中，输出字段差量与新增来源。

**验收。** 未改变输入时计量稳定；增加静态提示或工具描述后相关分项报告增长，不能自动更新基线。移除一个工具描述也必须被稳定计量识别；授权增长由同一代码变更说明其必要性及对默认输入的影响。UTF-8 字节只是确定性的增长信号，不转换成未经验证的 token、费用或成功率结论。

**代价与边界。** 测试不自动删提示、截断工具或修改生产预算。只有后续要改变 Agent 行为时才按[Agent 改进方法](agent-improvement.md) 做效果对照。避免对动态全部请求做精确 golden，也不照搬 T3 的具体额度。

## 交付顺序与停止条件

推荐先完成 D 的两个回放场景并嵌入 E 的里程碑，同时独立实现 G 的选检计划；随后根据实际缺口推进 F/H。I 是独立的小型检查，可在工具或提示词变更频繁时提前。各工作包以独立 diff 和验收证据交付，不要求一次性建设统一测试平台。

| 目标 | 应记录的证据 | 不能由此推出 |
| --- | --- | --- |
| 可测试性 | 固定输入、精确失败位置、正确实现通过且定向错误失败 | 供应商行为已完全覆盖 |
| 可靠性 | 重启后公开状态正确、副作用次数正确、旧响应被隔离 | 仅单元测试即可证明发行可靠 |
| 研发效率 | 同场景首跑耗时、准备步骤、首跑失败与重试次数、选检范围 | 测试数量少就一定更快或更好 |

运行命令以现有入口为准：Rust 用聚焦的 `cargo test --locked -p areal-engine --test <目标>`；投影传输用 `node --test clients/gui/scripts/desktop-projection-transport.test.mjs`；历史兼容用 `pnpm --dir clients/gui test:history-compat` 并准备匹配的固定产物。新增测试登记进已有 runner/manifest，GUI、Core、真实供应商、原生桌面和安装包证据分别报告。

本设计停止在候选方案与验收契约。实现前逐项复核并行工作是否已覆盖目标；已满足的项直接复用。仅在具体测试证明生产契约缺陷时扩大到产品修复，协议、持久化与 UI 改动同步更新其已有文档。
