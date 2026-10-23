# Base 设计系统 beta

此处是[架构阶段 B](architecture.md#bbase-设计系统)的最小基础切片。复用已有生产角色和组件，以实际挂载上下文验证；独立模拟题目属于阶段 C。准入集的数据维护在 registry.json，下面的区块由 design:sync 生成。

<!-- BEGIN GENERATED: base -->

候选 ID：`desktop-core`；版本：`0.2.0`；状态：`frozen-beta`。

来源快照：`b648e33127c09a3e2bade90c56bce29f1a0c9845`；冻结与兼容所有者：[design-system/base.md](../design-system/base.md)。

| 层 | 准入范围 |
| --- | --- |
| Foundations | 文字、表面与反馈、尺寸与间距、形状与动效 |
| Primitives | Button、ActionButton、Switch、Select、Feedback |
| Compositions | SettingsPage、SettingsSection、SettingsGroupCard、SettingsRow、SettingsSelect、SettingsSegmentedTabs、SettingsDisclosure、DecisionCard、ApprovalRequest、CollapsibleText、Messages、TurnProgress、TurnExecution、ToolEvent |
| Patterns | P-SETTINGS、P-DECISION |

### 成员准入

| 成员 | 合同 / 生产消费者 | 有限变体 | 状态 | 证据ID |
| --- | --- | --- | --- | --- |
| Button | [合同](../renderer/src/components/ui/button.md)；[消费者](../renderer/src/ApprovalRequest.tsx) | default/default, secondary/sm, outline/default, ghost/sm | default, disabled, keyboard-focus | E-CONTROLS |
| ActionButton | [合同](../renderer/src/components/ui/action-button.md)；[消费者](../renderer/src/settings/DisplaySettings.tsx) | secondary/sm | default, disabled, pending | E-CONTROLS |
| Switch | [合同](../renderer/src/components/ui/switch.md)；[消费者](../renderer/src/settings/SettingsPageParts.tsx) | default | checked, unchecked, disabled, keyboard-focus | E-CONTROLS |
| Select | [合同](../renderer/src/components/ui/select.md)；[消费者](../renderer/src/settings/SettingsPageParts.tsx) | secondary/sm | closed, open, selected, disabled, keyboard-focus | E-CONTROLS |
| Feedback | [合同](../renderer/src/components/ui/feedback.md)；[消费者](../renderer/src/DecisionCard.tsx) | inline | empty, status, error, unknown-message | E-CONTROLS |
| SettingsPage | [合同](../renderer/src/settings/SettingsPageParts.md#settingspage)；[消费者](../renderer/src/App.tsx) | settings-workspace | titled, untitled, wide, narrow | E-SETTINGS |
| SettingsSection | [合同](../renderer/src/settings/SettingsPageParts.md#settingssection)；[消费者](../renderer/src/settings/DisplaySettings.tsx) | heading, body-only | default | E-SETTINGS |
| SettingsGroupCard | [合同](../renderer/src/settings/SettingsPageParts.md#settingsgroupcard)；[消费者](../renderer/src/settings/DisplaySettings.tsx) | default, compact | default | E-SETTINGS |
| SettingsRow | [合同](../renderer/src/settings/SettingsPageParts.md#settingsrow)；[消费者](../renderer/src/settings/DisplaySettings.tsx) | default, wide | default, disabled, with-detail | E-SETTINGS |
| SettingsSelect | [合同](../renderer/src/settings/SettingsPageParts.md#settingsselect)；[消费者](../renderer/src/settings/DisplaySettings.tsx) | two-value-segmented, multi-value-secondary-sm | selected, disabled | E-SETTINGS |
| SettingsSegmentedTabs | [合同](../renderer/src/settings/SettingsPageParts.md#settingssegmentedtabs)；[消费者](../renderer/src/settings/DisplaySettings.tsx) | automatic-activation, manual-activation | selected, disabled, keyboard-focus | E-SETTINGS |
| SettingsDisclosure | [合同](../renderer/src/settings/SettingsPageParts.md#settingsdisclosure)；[消费者](../renderer/src/settings/DisplaySettings.tsx) | native-details | collapsed, expanded, keyboard-focus | E-SETTINGS |
| DecisionCard | [合同](../renderer/src/DecisionCard.md#decisioncard)；[消费者](../renderer/src/ApprovalRequest.tsx) | approval, question | ready, busy, failed, unknown-message | E-DECISION |
| ApprovalRequest | [合同](../renderer/src/DecisionCard.md#approvalrequest)；[消费者](../renderer/src/TaskRunConversations.tsx) | once-only, remember-allowed | ready, busy, submitted, failed, unknown | E-DECISION |
| CollapsibleText | [合同](../renderer/src/CollapsibleText.md)；[消费者](../renderer/src/Messages.tsx) | measured-preview | short, collapsed, expanded, keyboard-focus | E-DECISION |
| Messages | [合同](../renderer/src/Messages.md#messages)；[消费者](../renderer/src/App.tsx) | main, embedded | accepted-placeholder, following-latest, reading-history, completed, failed, unknown | E-CONVERSATION |
| TurnProgress | [合同](../renderer/src/Messages.md#turnprogress)；[消费者](../renderer/src/Messages.tsx) | ordered-progress | working, settled, manual-expanded, failed, unfinished | E-CONVERSATION |
| TurnExecution | [合同](../renderer/src/Messages.md#turnexecution)；[消费者](../renderer/src/Messages.tsx) | direct-item, grouped-items | working, completed-summary, failed, unknown, manual-expanded | E-CONVERSATION |
| ToolEvent | [合同](../renderer/src/Messages.md#toolevent)；[消费者](../renderer/src/Messages.tsx) | tool-summary, raw-record | running, completed, failed, unknown, expanded | E-CONVERSATION |

证据ID统一映射到 [Base证据索引](base-evidence.md)。路径验证只确认引用存在，不解析JSX证明消费者采用；真实符号导出由TypeScript检查。

### 验收条件

- 角色引用现有生产来源；目录不存数值副本
- 按成员准入表检查有限变体与状态；证据索引区分复验命令和已完成运行
- 设置组合挂载真实 SettingsPage 上下文；不只展示脱离页面的库默认
- 明暗、14/18 字号、宽/窄与键盘交互有独立运行断言
- 决策与长文本保留原权威状态、全文和焦点可达性
- 设置单选沿SettingsSelect公共sm变体；普通设置开关使用default，不由调用方另改尺寸
- 活跃设置说明保留独立角色、对比度偏好与自定义前景色，不连带修改禁用或过程信息
- 对话过程组合在逐步投影中验证接受消息占位、可见阅读锚点、返回最新、完成收敛及人工详情保留；异常不因final默认隐藏

### 边界

- frozen-beta 仅表示列明 GUI 切片可作为阶段 C 的固定输入，不代表稳定公共 API 或全 GUI 验收
- 仅覆盖列明生产renderer组件和本地fixture；Core、真实供应商、安装包、Web、CLI/TUI和完整自定义主题矩阵在范围外
- 成员状态与变体是有限准入声明，不表示每项笛卡尔组合均已运行；已完成证据以索引记录为准
- 完整P-CONVERSATION、P-RESOURCES、SidePane、生产文件宿主、重连与真实执行未准入；命令、图片和子对话fixture仅补充过程/阅读组合证据

<!-- END GENERATED: base -->

## 使用与变更

Base beta 是阶段 C 使用的固定 GUI 输入快照，尚不承诺稳定公共 API，也不代表全 GUI 已准入。`baseCandidate` 标识保留；`candidate` 表示等待验收，`frozen-beta` 表示完成列明验收并记录精确源码提交。冻结与兼容规则归本文件；成员、来源和状态归 registry.json；证据归 [base-evidence.md](base-evidence.md)。来源快照记录实际生产实现的完整提交；独立题目另外记录承载本合同与生成入口的完整冻结提交，不用会随分支移动的名称。

阶段 C 的独立题目通过生成的 [base-components.ts](../renderer/src/design-system/base-components.ts) 复用真实成员。该入口只服务开发验证，不建立发布包，也不改变正式应用版本。生产 Props、数值 Token 与样式仍归原源码所有者，目录不复制它们。路径检查不解析 JSX 证明调用关系；实际导出由类型检查验证。

删除已准入成员或改变已准入行为，需要提升 Base 版本并迁移消费者。新增验证夹具或补充同一合同的证据不提升版本，也不能悄悄改写已冻结快照的验收范围。新公共成员必须先有真实生产消费者、就近合同、有限变体和状态、可重复检查与可归属运行证据。未在成员表中的生产组件继续由原所有者维护。

历史探索题及其候选版本保留，以复现当时输入。Base 内部版本与应用发布、发行渠道和安装包版本独立。当前以 GUI 为先，后续 Web 需另行验证；CLI/TUI 不在此准入范围。P-RESOURCES 仍保留为候选；资源切片的真实文件与 Diff 返回证据不用于替代数据管理模式的准入。

## 复验入口

```sh
pnpm --dir clients/gui verify:design
pnpm --dir clients/gui typecheck
pnpm --dir clients/gui design:build
pnpm --dir clients/gui test:design
pnpm --dir clients/gui test:design --conversation-exercise
```

现有测试保存源码 SHA、工作树差异摘要、构建入口资产摘要、浏览器/viewport/DPR、状态条件、计算样式、原始截图哈希及失败诊断。设计状态和键盘/布局断言只证明列明的 fixture；截图不自动成为用户认可的视觉基线。

设置组合必须包含生产 SettingsPage 上下文。孤立 SettingsGroupCard 的库默认与挂载页面的变体可能不同；预览应复用实际组合，避免用 preview CSS 模拟生产上下文。

## 候选快照的探索题

[设置迁移题](exercises/settings-reflow.md)固定 `269ab4ec` 为输入，试用问题到证据的记录方法。它检验现有设置组合承受新内容的能力；候选快照固定仅用于实验复现，不表示 Base 已正式冻结、用户已接受视觉效果或正式阶段 C 已完成。

候选 `0.1.1` 的设置切片收敛：SettingsSelect 使用既有 control 尺寸和 navigation 圆角；设置预览与题目使用默认 Switch。输入快照 `0.1.0` 的对照暴露了紧凑档选择歧义，此处在公共所有者修正，不增加页面 CSS。当前仍保留窄容器上下排列的既有布局规则，未据参考的单一宽度更改断点。

候选 `0.1.2` 按[设置说明题](exercises/settings-contrast.md)核对明暗与对比度端点后，仅修订深色设置说明默认层级；保留本产品对比度斜率、明亮主题较强说明角色、禁用和已完成过程信息。自定义颜色通过原偏好归一化和派生，不增加消费者覆写。

[内容/决策迁移题](exercises/decision-transfer.md)固定候选0.1.2作为输入，组合现有 CollapsibleText 与 ApprovalRequest。长内容、窄容器、大字号与回执/失败/未知的探索不增加生产样式；窄卡正文沿用内部滚动，页脚动作留在滚动区外。该题保留候选版本，不因新增fixture提升Base版本，也不据一个额外题目声称通用性或盲测通过。

候选`0.1.3`将Messages、TurnProgress、TurnExecution和ToolEvent的过程/阅读切片纳入组合层，依据[动态信息流题](exercises/conversation-flow.md)。共享所有者统一phased/legacy过程收敛，工具详情保持挂载；正常终态与工具失败、UNKNOWN、未结算分别验证。正文增长时的可见锚点及显式返回通过生产阅读逻辑处理；预览尺寸只约束题目容器，不添加产品设计值。完整P-CONVERSATION仍在候选范围外，资源宿主返回、重连、真实执行及桌面验收未覆盖。

候选0.1.4协调当前生产设置变体与共享输入布局；SettingsSelect使用其既有sm，主满屏资源输入显式compact，Side默认布局不被祖先改变。较早题目的0.1.1/0.1.3尺寸与图片展开方式属于对应快照，不能覆盖当前生产所有者。该修订不冻结视觉基线，不将整个SidePane或完整资源生命周期纳入Base准入。
