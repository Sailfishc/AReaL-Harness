# 页面模式与有限选择

先从[用户交互模式](interactions.md)识别用户意图与约束，再选下列业务组合。同一页面可组合内容模式，但沿用一个壳层和主滚动区。以下是 v1 默认；既有未迁移页面不构成新增自由变体的依据。

<!-- BEGIN GENERATED: patterns -->

| ID / 用户任务 | 最小组合 / 生产参考 | 允许变化 | 验收重点 |
| --- | --- | --- | --- |
| P-SETTINGS 修改偏好或配置 | SettingsPage + SettingsSection + SettingsGroupCard + SettingsRow；[参考](../renderer/src/settings/DisplaySettings.tsx) | 分组、字段、文案与现有控件类型 | 标签/控件对齐，窄窗换行，值和反馈真实 |
| P-RESOURCES 查找并管理资源 | SettingsSearchInput + SettingsSegmentedTabs + Button + Switch + SettingsDisclosure + Feedback；[参考](../renderer/src/settings/PluginCenter.tsx) | 当前市场与资源分类、查询、详情、项目启用状态和局部读取反馈 | 限插件目录/详情及当前项目启停；安装、启用和连接分开；原提交只读核对，返回保留上下文 |
| P-CONVERSATION 阅读并推进任务 | Messages + TurnProgress + TurnExecution + ToolEvent + ConversationComposer + CommandDetails + AgentConversationPane + SentAttachment + ComposerSurface + SideChatPane + SidePane + Feedback；[参考](../renderer/src/design-system/ConversationFlowExercise.tsx) | 消息类型、工具结果、合法动作与上下文 | 权威状态、内容层级与阅读意图独立；按信息流合同验收完成收敛、人工展开和返回最新；未知提交不重放 |
| P-DECISION 回答或批准请求 | DecisionCard + ApprovalRequest + Feedback；[参考](../renderer/src/ApprovalRequest.tsx) | 请求正文及已有决策动作 | 关键参数可核对，动作和结果可达 |
| P-DETAIL 阅读或编辑详情 | SettingsDialog + SettingsDisclosure + Feedback；[参考](../renderer/src/settings/common.tsx) | 表单字段、正文及受控 footer | 返回/关闭路径和焦点恢复；不叠多层弹窗 |
| P-STATUS 了解状态并恢复 | Feedback + EmptySettings；[参考](../renderer/src/settings/ServiceStatusSettings.tsx) | 状态说明、必要详情及可行恢复入口 | 离线/失败/未知区分，静默刷新保留已确认内容 |

<!-- END GENERATED: patterns -->

P-RESOURCES 沿现有 PluginCenter 领域布局组合搜索、分类、列表、详情与反馈，不建立通用列表框架。共享意图与状态边界见[插件资源管理](../../../design/patterns/plugin-resources.md)，实际准入范围与运行证据见[Base](base.md)。目录成员仅表示列明的有限复用，不能扩大为完整插件安装、认证或连接生命周期。

定时任务沿用 P-CONVERSATION 的普通 Composer 和既有 ScheduledWorkspace 列表。全局新建立即进入无项目草稿，项目入口保留所选项目，当前会话添加只追加意图并聚焦。导航归用户点击，异步准备或创建回执不改变当前页面。运行环境在发送时准备，准备期间保留草稿和附件，成功只来自 Core 回执。

定时目录使用 P-STATUS 的局部状态反馈。冷 owner 的已发布快照显示“上次记录”和本次读取时间，不能把读取时间当作发布时间；完整性未知不能显示“没有任务”。缓存和成功的局部行在刷新失败时保留，显式“刷新这个项目”才可启动对应 Core。目录读取不扩大到启动其他聊天。

## 控件选择

| 意图 | 默认组件 | 限制 |
| --- | --- | --- |
| 执行一次操作或打开管理入口 | `ActionButton` / `Button` | 文字为主；不伪装成开关 |
| 真正可双向开启/关闭 | `Switch` / `SettingsSwitch` | 读取真实状态；单向停止/清理使用操作按钮 |
| 两个互斥设置值 | `SettingsSegmentedTabs` 或 `SettingsSelect` | 两值同时可见；不用于先后步骤或导航 |
| 三个及以上候选单选 | `Select` / `SettingsSelect` | 收起显示当前值，展开显示选中项；不铺开一排按钮 |
| 多选 | 现有 Checkbox / 多选拥有者 | 保留复选语义；不套单选 API |
| 显示更多信息 | 详情面板；短内容用 `SettingsDisclosure` | 明确“展开 / 收起”，保留可访问语义；不用左侧三角 |

既有控件合同的详细规则归 [设置控件与反馈](#设置控件与反馈)。

## 设置组合布局

Worktree 的配置菜单、准备状态和项目环境按[领域设计规范](worktrees.md)组合既有模式。脚本平台标签、设置子页导航与目录层级 Chevron 的有限例外见[例外表](worktrees.md#有限例外与共享规则)；不改变普通设置的默认控件选择；迁移与验收范围见 [Worktree 验收题](exercises/worktrees.md)。

`SET-LAYOUT-01`：复用 SettingsPage → SettingsSection → SettingsGroupCard → SettingsRow。宽组共享控件右边缘；窄组由 SettingsWorkspace.css 的容器规则切为上下排列，控件在完整标签/说明之后左对齐。页面不重新定义断点，不以缩字号、固定行高或偏移隐藏长文案。

`SET-CONTENT-01`：标签、说明、值和反馈沿用生产语义角色，行高随内容增长。控件尺寸的唯一规则见 [设置控件与反馈](#设置控件与反馈)，页面不自行选择紧凑档。选项过长时由共享 Select 的截断和完整菜单承担，不为页面另造控件。参考与本产品组合不同的布局需要有界内容验证后决定采纳或保留；单次参考截图不覆盖现有共享规则。

### 设置控件与反馈

本节是新增、修改和评审客户端 UI 必须遵循的约束。设置页通过外框表达功能分组，行内展示简短名称和当前状态，控件按交互语义选择；不能只统一圆角而保留错误的交互。

#### 按功能分组并保持对齐

- 使用 `SettingsSection` 标记功能组、`SettingsGroupCard` 的外框包住相关设置；同组行以细分隔线连接。一个卡片只表达一个功能关系，不按实现模块机械堆叠信息。
- 使用 `SettingsRow`：名称和必要的一行说明在左，当前值与控件在右；同组的内容边缘、控件右边缘保持一致。窄窗口空间不足时，控件移到说明下方，不截断或挤出边界。
- 对普通用户无帮助的完整目录、实例编号与实现说明移入明确的详情入口。主页面保留完成当前操作所需的信息。

#### 按交互类型选择控件

| 用户意图 | 控件 | 规则与现有所有者 |
|---|---|---|
| 点击执行一次操作、打开管理界面 | 文字按钮 | 复用 `Button` / `ActionButton`，如“导入”“更改”“查看”“管理空间”；默认不加装饰图标，不做成开关 |
| 开启 / 关闭一个状态 | 左右滑动开关 | 复用 `Switch` / `SettingsSwitch`；以真实状态驱动，操作中禁用并显示简短反馈，失败后保留或恢复已确认状态 |
| 三个及以上候选值中选择一个 | 下拉按钮与菜单 | 复用 `Select`；收起时显示当前值和右侧小箭头，展开后显示候选项与选中标记；不把选项摊成一排按钮 |
| 两个互斥值中选择一个 | 并排的两个选项 | 复用 `SettingsSegmentedTabs`，如“底部 / 右侧”；全部可见，选中项高亮，不再套下拉菜单 |

设置行默认使用 `Switch` 的 default 尺寸（`SettingsSwitch` 同样默认）；三项及以上沿用 `SettingsSelect` 当前公共 sm 变体；具体尺寸、形状由组件决定，页面不得自行改档。尺寸与水平留白归公共实现，不在页面覆盖。

此处“多项选择”指多个候选值的单选，不等于一次选择多个值。真正允许多值选择时沿用支持复选语义的现有控件，不能假装成单选菜单。导航 Tab 与设置值选择也不能混为一谈。

值、动作、导航与步骤的区分统一见[控件选择](../../../design/components/controls.md)。本表维护 GUI 的具体映射；关闭服务、清理资源等操作继续绑定已有确认与拒绝入口。

#### 用状态反馈代替大段操作说明

- 常驻信息按[设置与管理](../../../design/patterns/settings.md)组织。普通开关不配“开启 / 关闭”文字按钮，不在控件下堆叠连接、恢复和实现流程说明。
- 共享状态与动作见[反馈与恢复](../../../design/patterns/feedback-and-recovery.md)。GUI 沿用“已开启”“已关闭”“处理中”“待确认”等本端文案，绑定所属业务状态。
- 按[设置与管理](../../../design/patterns/settings.md#值动作与生效范围)说明实际影响；GUI 使用所属确认或管理面板呈现。
- 普通操作按钮采用紧凑圆角矩形、轻填充和克制的边框；危险操作通过文字及语义色区别。尺寸、圆角和明暗填充由公共 Token 及组件变体统一管理。图标仅用于有明确识别价值的独立图标操作，不给每个文字按钮机械配图标。



[设置迁移题](exercises/settings-reflow.md)固定内容和反证，用于探索这两条规则；题目不自行创建新设计值。

## 对话信息流

活动类型、图片与命令组默认收起、组内纵向滚动，以及右侧上下文的新增设计要求见[对话流设计草案](conversation-flow.md)。该草案明确区分活动组与过程总组，列出当前源码差异；未实施部分不视为下列合同已经完成迁移。

共享内容与阅读组织见[任务推进与过程阅读](../../../design/patterns/task-progress.md)，请求与回执含义见[控制与审批](../../../design/people-and-agents/control-and-approval.md)，父子关系与停止交接见[委派与交接](../../../design/people-and-agents/delegation-and-handoff.md)。以下保留 GUI 的 CONV-* 合同与实际所有者。

以下是 P-CONVERSATION 的目标合同。参考依据见[信息流观察](references.md#对话信息流的动态观察)，复验题见[动态信息流题](exercises/conversation-flow.md)。该完整模式尚未准入Base候选0.1.3；已准入的仅是下述动态题验证过的过程/阅读组合；另有真实 Electron E1 对话专项，范围见复验题，不能据此提升完整模式或所有桌面宿主准入。

`CONV-OWNER-01`：执行、内容展示和阅读意图分别拥有状态，不合成一个页面大枚举。暂停意图、轮次终态与工具结算分别表达：Core 已记录 userPause / coreRecovery 时，即使未确认的工具结果使轮次成为 failed，也保留对应中断原因；UNKNOWN 仍可见并进入原核查路径，不能显示为正常完成或已确认终止。核查只记录实际检查的事实，不重放工具或改写原结果。

| 事实 | 所有者 | 决定什么 |
| --- | --- | --- |
| 等待、执行、需确认、完成、失败与未知 | 原 Core/Runtime 权威投影 | 状态反馈与合法动作；不由文字、动画或折叠推断成功 |
| 用户消息、过程、工具、最终回答与资源入口 | Messages / TurnExecution / ToolEvent | 保留身份、顺序与语义层级，组合展示而不改写原始历史 |
| 跟随最新、回看历史、手动展开与返回 | Messages 既有本地阅读所有者及所属详情组件 | 滚动与展开选择；不提交、恢复或重放执行 |

`CONV-INPUT-01`：若存在预测指令或建议，它属于未发送输入；出现建议不等于用户提交。采集回复增长时排除 Composer、用户提示和预测建议。业务页不得因建议自动提交或把建议插入已受理消息历史；不据本条规则新增预测功能。

`CONV-CONTENT-01`：按 Core 的消息身份、顺序及 commentary / final_answer 展示。当前正文增量完整可读；工具开始、运行、结束与结果分别表达，不能用模型正文中的“已执行”冒充工具回执，也不能用命令等待代替正文增长证据。

`CONV-GROUP-01`：本轮过程与最终回答是不同层级。正常完成且已有明确最终回答时，目标默认将过程文字和常规工具活动收入可展开的过程总组，最终回答独立可读；展开后保持原文与活动顺序。总组→活动摘要→具体命令输出各有明确身份与展开入口，不强制每条内容都套三层。需确认、失败、未知或尚在运行的资源应保持可发现的状态与合法动作，不能只因 final 出现就当作已结算内容隐藏。

`CONV-RHYTHM-01`：对话时间线只有一种节奏。正文、过程说明、活动行、子代理行与底部过程状态共用 `--text-conversation`（跟随内容字号）与 `--conversation-line`（14px 时 20px），块与块之间只由 `--conversation-gap`（12px）分隔一次，不叠加首尾外边距。活动行与正文同字号，只靠颜色与图标区分层级。过程耗时标题在运行中与完成后都显示，与用户消息之间、与其下第一条过程内容之间各只隔一个 `--conversation-gap`；运行中过程默认展开，完成后默认收起。当前状态只在回合底部一行。参考依据是 Codex 26.1013 的截图实测（14/20.5px、块节距约 33px），不复制其像素或品牌。

`CONV-ACTIVITY-01`：两条消息之间的工具活动按"连续同一动作"分段，不再把整段混合成一组。连续多次同一动作（运行命令、读取文件、修改文件、查找文件，或同名的其他工具）合成一行可折叠的段，标题是过去时动词短语，如“已运行命令”“已读取文件”；段内仍有运行中的项时用进行时“正在运行命令”。标题不显示数量。只有一项时不建段，直接显示该项自己的行（如“已运行 git add …”）。思考组、子代理创建等行各自成段并打断合并；段内顺序与原始历史一致。失败工具仍不进入默认行，由过程标题的失败标识进入。实现见 `activityRuns` / `TurnExecution`，回归见 `scripts/activity-runs.test.mjs`。

`CONV-PROCESS-01`：对话时间线以 Core 的 `commentary` / `final_answer` 为边界，不按文字内容猜测思考或工具事件。耗时位于过程顶部并控制整段过程的展开与折叠；已完成过程默认折叠，最终回答及交付内容不在折叠范围。工具分组独立默认折叠，展开后列表限高 224px 并支持上下滚动。长过程仍在六行高度内滚动，当前流式正文完整展示。过程和活动区域支持键盘聚焦与滚动；打开单条命令或文件比较时，列表取消限高，避免与具体输出同时形成双层滚动。这是过程阅读的专用机制，不改变已发送用户长消息的展开行为。执行中的状态只在回合末尾一处，见 `CONV-STATUS-01`。成功图片结果、可打开的子对话保留轻量入口，原始记录按需查看；文件变更默认显示前五条，多余部分可展开或收起，行数继续取自 Core 本轮比较。Markdown 图片仅通过现有会话授权的 Core blob 读取直接显示；不自动读取任意本机路径或远端图片。普通链接直接打开，独立本地网页链接显示预览卡片，点击仍经过现有 Main 导航策略，不探测服务状态。`design-system.html?conversation` 提供同一生产组件的隔离预览，不连接用户 Core。

`CONV-STATUS-01`：一个回合只有一处实时状态，位于回合末尾，是一句话加左向右亮色扫光（ThinkingStatus）。工具运行时这句话是当前动作与目标（“正在运行命令… pnpm test”），模型思考时是公开思考摘要或 Thinking；上方的工具行保持静态，不再各自扫光。终态、reduced motion、连接中断、模型重试和待确认结果用静态文字。宿主已在 Composer 里显示待处理的审批或提问卡时（`Messages.decisionShown`），回合末尾不再重复“等待你的确认或回答”；没有卡片的只读或嵌入视图仍显示这句静态文字。审批卡内的“查看完整请求”“授权范围说明”等展开入口是文字按钮，不带展开三角；卡片内边距 12px，标题、正文与按钮之间各 4–8px。理由：多处同时扫光或同一等待说两遍，读者分不清哪一处才代表“现在”；把状态收在末尾一行，和 Composer 里唯一的决定入口各司其职。

`CONV-DISCLOSURE-01`：默认展开状态和用户选择分别记录。在同一组/详情身份存续期间，不用无关增量或刷新重置人工选择；父组收起与子项展开值分别处理，重新打开父组应恢复其仍存续的详情状态。跨轮次或新总组不得继承不属于它的展开状态。这是本产品验收约束，不能仅凭一次参考的完成总组截图声称已验证。

连续展开沿原 ToolEvent / TurnProgress 使用现有 Base UI Collapsible 的测量高度与中断处理，内容身份保持挂载。命令详情采用已观察的 300ms 高度过渡与可逆箭头；过程总组箭头保留本产品 normal token，不将所有交互改成一个全局时长。快速反向须从当前呈现高度连续返回，不能等待旧动画结束再响应；减少动态效果时立即切换，隐藏内容不可继续接受焦点。原始记录、文件等其他详情未因本条自动通过动效验收。

`CONV-READ-01`：跟随最新时，新内容可推进视口；用户主动向上阅读后，后续正文增长应保留其阅读锚点。展开、折叠及完成收敛改变内容高度时，区分布局引起的scrollTop调整与读者离开最新的动作，不因一次尺寸变化擅自恢复跟随。返回最新是显式阅读动作；等待可观察到的到达条件后才称跟随已恢复，点击返回成功不等于滚动动画已经结束。实现阈值与坐标留在原阅读所有者，不由页面按截图硬编码。

只有 Messages 时间线拥有对话纵向滚动。非草稿 conversation-pane 使用 clip 约束越界内容，避免 overflow:hidden 在焦点/scrollIntoView 时成为第二个可滚动容器并移动 Composer。重访子面板后再次发送，以及正常/暂停收敛过程中，均需连续核对 Composer 在窗口内、外层 scrollTop 保持零；仅在某个终态看见输入区不足以通过。

`CONV-RESOURCE-01`：图片、网页来源、子代理等保留对应内容的轻量入口与真实状态；打开和返回应保持父聊天身份与阅读上下文。活动列表随主对话滚动，具体命令输出可沿用既有有界阅读器。网页摘要或引用不能当作独立网页面板已打开，子代理完成也不替代父任务完成。 图片检查复用MessageAttachment的共享查看器：真实图像字节、缩放比例、实际大小、适应窗口及有界平移分别可核查。100%表示一个图像像素对应一个CSS像素，不按设备DPR放大；缩放只改变本次查看，不重新读取或执行工具。关闭仍由原Dialog恢复触发焦点。不得用带文字的色块冒充已加载图片。

`CONV-COMMAND-01`：命令入口展示原始命令与工作目录；详情将同一进程的开始、输出读取、结束投影为一份连续记录，stdout/stderr不以模型正文替代。只有明确且无歧义的processId关系才能归并；输出读取不是重新执行。运行、已结束、退出码、输出未收集完整、失败和未知分别表达，不能用工具调用返回成功推断进程已经退出。详情展开由原ToolEvent和CommandDetails拥有，不能由场景脚本预设展开结果。

`CONV-PARALLEL-01`：子代理在父时间线里是两条事件行，不是带状态的卡片。成功的创建回执画为“<标题> 开始工作”；父对话通过 agent_wait / agent_wait_any / agent_wait_all 观察到子代理已结束（回执 `settled: true` 且非超时）时，在那条等待回执的位置画“<标题> 已完成 / 已中断 / 失败”。没有这样的回执就不画完成行：读取子对话、子任务在别处完成、或父任务命令结束，都不改写父时间线；实时状态归子代理面板与任务上下文。两行与正文同字号同节奏（`--text-conversation` / `--conversation-line`），各自成段、不并入同类工具分组；整行即打开子对话的入口，不另放“查看”或运行中按钮，原始记录箭头只在悬停或聚焦时出现。标题优先用该子对话的标题，其次是真实委派的 prompt / input 内容，不能只放不具辨识度的短ID。子对话与父任务互不推断完成。打开子对话复用AgentConversationPane，父消息阅读所有者保持挂载。关闭面板只结束阅读，不能停止、重启或重放任务；窄容器可以覆盖主视图，但返回须保留父聊天与人工展开。理由：开始与结束是父对话里真实发生过的两件事，画在发生的位置，阅读顺序就是执行顺序；把实时状态塞进创建行会让历史行随时间变化，和时间线的含义冲突。

`CONV-SCENARIO-01`：复杂信息流必须有一条有意义的复合任务作为组合样板，包含命令增量、并行子代理、资源查看和最终收敛。固定输入沿既有投影接口到达，场景仅拥有到达顺序及面板选择；分组、进程归并、阅读锚点与详情状态仍由生产所有者处理。每个关键状态关联参考证据、实现帧和差异判断；缺少对应参考的时序标为产品选择，不能把独立采样拼成一次真实参考旅程。规则/目录检查、行为通过和视觉一致分别报告。视频候选、关键帧核查和差异裁决按[默认设计流程](structured-flow.md#执行顺序与每步完成条件)及[准入合同](governance.md#差异筛选准入)执行；本规则仅拥有信息流组合，候选意见不直接改变过程、阅读或业务状态所有权。

减少动态效果沿同一有效偏好覆盖正文、过程箭头、侧面板和任务列表运行图标；静止图标仍表示真实运行，不把“停止动画”投影为任务已结束。图片缩放反馈可保持即时，不为所有资源虚构淡入/退场动画。按[E2 专项](exercises/conversation-flow.md#真实-electron-连续动效专项-e2)将视频与 RAF/输入/阅读证据关联。

### 输入区与面板组合

审批按钮的 split 几何、Side 面板比例、Composer 紧凑布局是当前组合规则，不作为全局控件的新默认值。

`CONV-COMPOSER-01`：默认布局的 Composer 是对话的一部分。输入文字用 `--text-conversation` / `--conversation-line`（默认 14px / 20px），与发出后的用户气泡一致；外框圆角 `--radius-composer`（18px），内边距上 12、左右 12、下 8；编辑区最少 40px，空态总高约 88px，内容超过 40dvh 后在编辑区内滚动；工具栏 28px，主按钮 28px 圆。附件图片缩略图 96px。上方上下文条可见高度 34px，圆角与输入框相同，Worktree 配置收在其最右齿轮里（`WT-PICKER-01`），工具栏不放 Worktree，也不加语音输入。运行中不在输入框上方加状态栏，停止就是主按钮本身；待处理审批只以卡片出现在输入框上方（`CONV-STATUS-01`）。理由：输入区比对话正文大一号、留白更厚时，视线在“读”和“写”之间要换一次尺度；同一字号与节奏让 Composer 读起来像对话的下一行。

主 Composer 的模型配置保存与消息发送反馈分开：保存期间仍可编辑草稿，不播放发送中的 Spinner，也不通过禁用滑块打断焦点。`ConversationComposer.modelPending` 只锁定模型配置动作，发送入口仍由宿主阻止；滑块保留待保存位置，完成或失败后回到 Core 确认值。未知结果继续沿原恢复路径处理，不自动重试。

`ChatPromptEditor.surfaceLayout` 透传 `ComposerSurface.layout`，仅有 default / compact。App 为满屏资源下的主 Composer / DraftComposer 选择 compact；Side 不继承工作区祖先的输入布局。变体、容器重排和模型入口基础样式归 ComposerSurface.css，不能在页面复制全屏选择器。ConversationComposer 仍理解模型目录和继承；主/Side 的草稿、来源、配置、提交及未知受理归原业务所有者。Side 的错误与带回反馈复用 Feedback。

`design-system.html?shared-workspace` 组合真实主输入、SideChatPane、SidePane 与 portal 设置；本地动作不执行任务。运行 `node clients/gui/scripts/design-system-smoke.mjs --shared-workspace` 验证代表条件；真实发送和模型隔离使用 `conversation-derivation-smoke.mjs --shared-workspace` 与已核对的 AREAL_CORE_BIN。设计裁决、规则强度与范围归[共享工作区合同](exercises/shared-workspace.md)。

### Electron 宿主与输入边界

以下细化已有 `CONV-INPUT-01`、`CONV-RESOURCE-01` 与 `CONV-PARALLEL-01`，不新建页面模式或执行状态机。验证入口与取证边界见 [E3 专项](exercises/conversation-flow.md#真实-electron-宿主与新内容专项-e3)及[E4原生补充](exercises/conversation-flow.md#原生宿主补充-e4)。

- **焦点和阅读分开保留**：打开子对话或原生浏览器面板时记住实际入口及所属项目/会话。关闭后优先回该入口；入口已卸载时才回同会话 Composer。恢复使用 `preventScroll`，不能为了键盘可达性把读者拉到另一段历史。跨会话的旧入口不得抢焦点。设置页替换聊天子树时，返回可解析同会话重挂的 Composer，不能只保留已断开的 DOM 引用。
- **输入法先于应用动作**：组合输入期间的 Enter/Space 属于确认上屏，Escape 属于取消组合；不能发送、取消消息编辑或关闭工作区。检查 `isComposing` 及 Chromium `keyCode=229`；非组合状态的下一次 Enter/Escape 才按原提交/取消合同执行。不要把中文粘贴、CDP `insertText` 或合成 composition 当作原生候选验证。
- **缩放不改变业务**：记录真实 BrowserWindow content bounds、CSS viewport、DPR 和 webContents zoom。变更后 Composer/关闭入口仍可达，草稿与权威轮次/工具身份保留，不重新请求模型。宽窄布局沿原宿主所有者；renderer viewport 模拟与真实窗口尺寸分别标注。
- **快捷键逐层验收**：Shift+Enter 换行、Cmd+, 进入设置、Escape 返回分别核对可见目标、焦点和草稿。CDP 键盘事件只能证明实际到达的路径；Electron 原生菜单未被触发时记录未覆盖，不把按键已发送写成快捷键已通过。

焦点恢复和组合 Escape 是本产品采纳的可达性/输入正确性要求。E3 的 Codex 子面板关闭样本落在 BODY，CDP Cmd+, 未打开原生设置；不把本产品的修复反写成 Codex 已观察行为。E4另观察到Codex网页按钮交互后宿主焦点为WEBVIEW，隐藏页签面板后回到Composer；这只支持该路径，不证明任意入口都恢复。

- **窗口激活独立核对**：记录真实窗口身份与 focus/blur 事件；离开再返回后，同一草稿、可见阅读锚点和预期焦点分别核对。BrowserWindow API 激活自有辅助窗口能覆盖该切片，不能冒充物理 Cmd+Tab、跨应用、多显示器或后台自动抢焦点测试。
- **原生网页独立核对**：宿主工具栏、独立 WebContents 的可见内容/交互、视图隐藏分别有证据。主 renderer 截图空白不能推断网页未渲染；隐藏后AX仍列出旧页面，也不能推断它仍可见。关闭面板保留原聊天草稿与阅读位置，不重新调用模型。未触发的候选列表和仅上屏的英文文字，均不得记作原生中文候选通过。

### 从证据回溯到规则和组件

这里拥有对话组合的设计决策；结构化引用在[信息流合同](surfaces/conversation-flow.json)，观察事实在[参考观察索引](references.md#对话信息流的动态观察)。正文规则不复制到JSON。调用方选择P-CONVERSATION后必须声明全部规则ID和必需检查点；目录检查只能阻断遗漏或虚构引用，不能证明实现遵守。

| 规则 | 依据与判断强度 | 修改所有者 | 合同检查点 |
| --- | --- | --- | --- |
| CONV-OWNER-01 | 本仓既有执行权威和[职责分层](architecture.md#分层与所有权)，不是从Codex外观推断其架构 | 原Core投影 / Messages / 所属详情组件 | ready、busy、failed、unknown |
| CONV-INPUT-01 | OBS-CONV-INPUT：可见建议及用户说明；不推断预测机制 | ConversationComposer输入边界 / Messages已受理内容 | ready |
| CONV-CONTENT-01 | OBS-CONV-TOOL：真实运行与成功输出；内容顺序仍服从本仓投影 | Messages / TurnExecution / ToolEvent | busy、failed、unknown |
| CONV-GROUP-01 | OBS-CONV-GROUP：参考终态层级；采纳为本产品正常完成的默认组合 | Messages既有过程总组 / TurnExecution | completed；同时保留failed、unknown反例 |
| CONV-DISCLOSURE-01 | OBS-CONV-OPEN-GAP：跨完成保留未实测；明确的产品选择，不是参考事实 | 同身份过程总组、活动组和ToolEvent | tool-details、completed |
| CONV-READ-01 | OBS-CONV-READ：生成中可见锚点和返回后的连续样本；目标规则不复制测量常量 | Messages既有阅读逻辑 | reading-history、following-latest |
| CONV-RESOURCE-01 | OBS-CONV-RESOURCE：图片/子对话入口直接观察；独立网页面板仍未知 | ToolEvent及既有父聊天/资源面板所有者 | busy、completed；资源返回按复验题追加 |
| CONV-COMMAND-01 | OBS-CONV-TOOL支持Shell输入/输出与终态；分批读取的节奏由本仓公开进程投影构造，不声称参考已连续采齐 | processItems / ToolEvent / CommandDetails | command-streaming、tool-details、completed |
| CONV-STATUS-01 | 参考对话流末尾单行扫光状态；审批卡为唯一的等待入口 | TurnActivity / ThinkingStatus / DecisionCard / 宿主 Composer | running、awaiting-decision、completed |
| CONV-PARALLEL-01 | OBS-CONV-RESOURCE支持独立子对话；父子不同步完成是本产品显式约束 | AgentIdentity / conversationPresentation.agentSettlements / ToolEvent / AgentConversationPane / 原父聊天宿主 | parallel-working、child-conversation、completed |
| CONV-SCENARIO-01 | 原动态题仅有命令和重复段落，遗漏资源及子对话路径；复合题用于阻止同类范围遗漏 | ConversationFlowExercise及其输入fixture；生产所有者不迁移 | 全部复合检查点及逐状态对照 |

### 组合与变化边界

正常完成的阅读层级为：用户消息 → 可展开的过程总组（过程文字与常规活动，保留原顺序）→ 独立最终回答；资源沿所属内容提供入口。只有实际存在子活动时才展开下一层，不给每条纯文字强加工具外壳。执行异常与未结算资源沿权威投影保持可发现。

页面允许变化的是任务文案、消息内容、真实资源、业务上下文与合法动作绑定。分组条件、人工展开保留、跟随/回看规则、反馈语义和设计数值都回到公共所有者；新增任务不另写一套页面CSS或折叠/滚动策略。过程文字和命令使用现有正文/过程角色，动作使用现有控件，间距与颜色沿Foundations；本轮观察没有足够依据修改Token。

| 到达事件 | 执行事实 | 阅读/展开响应 | 不能据此声称 |
| --- | --- | --- | --- |
| 新消息被权威接受 | 增加本轮身份并进入执行 | 原阅读所有者处理新轮占位；冷历史与续接不冒充新提交 | Composer出现建议就是接受 |
| 正文追加，用户回看历史 | 本轮继续执行 | 保存同一可见内容锚点；不因高度变化自动跟随 | scrollTop数值不变就一定没有跳动 |
| 用户返回最新 | 执行状态不变 | 先观察滚动到达，再核验后续增量跟随 | 点击回执就是到达底部 |
| 用户打开详情 | 工具状态不变 | 按详情身份记录人工选择，与父组/default分离 | 展开动作完成了工具或重新执行了它 |
| 正常完成且final存在 | 以权威终态和资源结算判断 | 适用默认值的过程收敛；人工选择按原身份保留，final独立 | final出现就能隐藏失败/UNKNOWN/仍运行资源 |

这些行是不同状态轴的交互，不组成新的全局状态机。结构化合同的states是验收检查点，不能拿它替代Core状态、重连快照或真实用户操作。

### 当前实现差异

| 所有者 | 当前源码事实 | 迁移/验收缺口 |
| --- | --- | --- |
| Messages / TurnProgress | 带phase与legacy均复用从运行期挂载的过程总组；正常完成时默认收敛，final独立 | 动态renderer题与选定E1真实Electron旅程已验；全恢复/原生宿主仍未覆盖 |
| TurnExecution / ToolEvent | 同一命令归并分批输出；人工详情由原组件保留；失败/未知/未结算不默认收敛 | 复合题之外，E1覆盖真实进程、子对话及图片；网页/原生宿主另验 |
| ConversationTimelinePreview | 切换整份live/completed fixture，并关闭回复占位 | 不证明接受消息→逐项追加→完成，也不证明真实聊天的阅读占位行为 |
| ConversationFlowExercise / Messages阅读逻辑 | 同一任务串接命令、子代理、图片、正文与收敛；可自动播放或暂停逐事件推进 | 复合题在生产renderer中验收；不是Core或桌面验收 |
| AgentConversationPane / SentAttachment | 复合题挂载生产子对话与图片预览，读取仅由隔离fixture响应 | 本题仍为fixture；E1另验选定生产子对话、图片返回和GUI重开，原生面板及完整重连矩阵仍未覆盖 |

## 按钮与表面

普通行内操作采用 `ActionButton`；其现有默认是紧凑的次要操作。页面级主要提交才使用 `Button` 的主要变体，次要动作使用 outline / secondary / ghost 的已有用途。危险动作使用 destructive / destructive-subtle 并保留原确认合同。Composer 的发送/停止沿用 composer 变体，不推广到设置页。

一个外框对应一个功能关系；只读详情与工具过程优先轻量展示。不要把每一行、每段状态、每个按钮再装进独立大卡片。选中、hover、focus、disabled、busy 与 error 使用组件状态，业务页面不重新描边或覆盖控件圆角。

## 状态必须先于样式决定

共享状态的展示与动作统一见[反馈与恢复](../../../design/patterns/feedback-and-recovery.md)。本端使用 Feedback、原表单与业务状态投影落实，不维护另一张状态语义表。具体 GUI 规则 ID 与验收状态仍在本目录定义。

## 最小实现说明

新页面、公共模式或跨状态的实质修改先按[结构化流程](structured-flow.md)在 `surfaces/` 登记合同；纯文案或沿现有合同的小改动可引用已有合同。变更说明简短引用合同及差异即可：

```text
用户任务：
模式 ID / 生产参考：
复用组件 / Token 角色：
状态与宽窄条件：
例外（没有则写无）：
验证证据与未覆盖项：
```

例如新增配置导入入口：P-SETTINGS，沿用设置行和 ActionButton，调用方管理文件选择及提交；覆盖空、处理中、失败、成功与窄窗，只有诊断详情可展开。不能借此新建整套导入仪表盘或换主题。
