**中文** | [English](README.en.md)

# @areal/ui

AReaL 的私有 workspace 包，承接首批 CSS 基础值、React 控件、组件合同和 Agent 入口。保留现有视觉，当前不发布 npm。

消费者在 package.json 声明 `"@areal/ui": "workspace:*"`，由 pnpm 接入本地包。包与 npm 发布包使用相同格式；workspace 指本地解析方式，private 阻止误发布。先构建包再构建消费者，GUI 公共脚本已串联该依赖。

稳定组件从 `@areal/ui` 导入；候选组件从 `@areal/ui/wip` 导入。宿主使用 React 19、Base UI 和 Tailwind 4，在 Tailwind 后导入 `@areal/ui/styles.css`。`foundation.css` 提供已采用的 CSS 变量；可选 `themes.css` 提供默认明暗调色板，沿同一纯函数生成。AReaL 宿主仍拥有未迁入的主题别名和保存的偏好。

源值编辑 tokens.json，显式运行 generate，再运行 build 和 check。基础产物生成到 src/generated；主题算法归 src/theme.ts。组件说明与代码就近维护，API 由 TypeScript 声明生成；既有站点消费真实导出，并提供独立示例、components.json、llms.txt 与 Markdown。

每个目录组件的同名 MD 与实现同目录，维护“何时使用、组成、状态、行为、内容、可访问性、规则、示例”。元数据使用简单 YAML 兼容格式，aliases/related 数组使用行内 JSON。生成器检查完整性和关联目标；站点从同一索引显示元数据、MD 原文和该组件独立示例，不另抄 Props 或维护第二份文档目录。

稳定成员为 Button；Disclosure、ActivityGroup、ImageDisclosure、TaskContext 由实验入口提供。三类对话组合实现位于 src/conversation，基础控件位于 src/components；基础层禁止反向导入对话层。对话外观单独导入 `@areal/ui/conversation.css`，由设计预览与生产对话共同消费；状态与导航接线仍归原renderer所有者。

TaskContext 通过 Section、Item、Sources 组合变更、项目、子任务和来源。组件负责基本呈现与读取交互；真实状态、资源读取、窄窗导航与焦点恢复由宿主提供。产品状态与资源生命周期继续归renderer适配层。开发前读取 [Agent 入口](agent-guide.md)，架构与取舍见仓库 D-004。

SubagentPanel 提供入口后的完整列表、按独立状态分区、完成组展开与历史详情返回；历史内容由宿主提供。ThinkingStatus 提供从左到右的思考扫描，减少动态效果时静态呈现，不可见或后台停止循环。两者同样保留实验入口，生产消费不自动扩大稳定API或Base准入。

ThinkingStatus 的 label 消费公开模型过程摘要并在变化时局部过渡，无摘要才回退 Thinking。任务上下文卡片由产品顶部按钮控制，与资源阅读器分开；具体优化依据见原对话流规范和参考记录。

ComposerSurface/ComposerToolbar 提供主聊、Side与草稿共享的输入布局，导入 conversation.css。SettingsPage/Section/GroupCard/Row 提供已有设置布局，导入 settings.css；两组均从wip导入，各自维护就近MD与可操作状态实例。旧renderer路径转接同一实现。编辑器、模型权限、提交、配置值、保存回执与导航守卫仍归原宿主，不因布局提取而迁入UI包。

Worktree领域组合位于src/worktree，从wip导入并使用worktree.css；配置、准备、目录、环境设置和工作区详情拥有就近MD与独立实例。NotificationToast从core层提供四级短时通知，使用notifications.css，默认5秒，悬停/焦点暂停；原ToastHost保持应用通知通道。

共享控件、设置编辑/选择、决策卡、代码/Diff及Markdown阅读器、附件、命令详情和工作台组合已迁入包。工作台样式从`@areal/ui/workbench.css`导入；原renderer入口保留本地化、偏好与业务适配。组件组的`exports`元数据覆盖全部子组件，共用同目录MD；生成器拒绝缺失或重复归属。具体范围与宿主边界见[组件迁移](../../design-system/component-migration.md)。
