**中文** | [English](README.en.md)

# @areal/ui

AReaL 的私有 workspace 包，承接首批 CSS 基础值、React 控件、组件合同和 Agent 入口。保留现有视觉，当前不发布 npm。

消费者在 package.json 声明 `"@areal/ui": "workspace:*"`，由 pnpm 接入本地包。包与 npm 发布包使用相同格式；workspace 指本地解析方式，private 阻止误发布。先构建包再构建消费者，GUI 公共脚本已串联该依赖。

稳定组件从 `@areal/ui` 导入；候选组件从 `@areal/ui/wip` 导入。宿主使用 React 19、Base UI 和 Tailwind 4，在 Tailwind 后导入 `@areal/ui/styles.css`。`foundation.css` 提供已采用的 CSS 变量；可选 `themes.css` 提供默认明暗调色板，沿同一纯函数生成。AReaL 宿主仍拥有未迁入的主题别名和保存的偏好。

源值编辑 tokens.json，显式运行 generate，再运行 build 和 check。基础产物生成到 src/generated；主题算法归 src/theme.ts。组件说明与代码就近维护，API 由 TypeScript 声明生成；既有站点消费真实导出，并提供独立示例、components.json、llms.txt 与 Markdown。

每个目录组件的同名 MD 与实现同目录，维护“何时使用、组成、状态、行为、内容、可访问性、规则、示例”。元数据使用简单 YAML 兼容格式，aliases/related 数组使用行内 JSON。生成器检查完整性和关联目标；站点从同一索引显示元数据、MD 原文和该组件独立示例，不另抄 Props 或维护第二份文档目录。

稳定成员为 Button；Disclosure、ActivityGroup、ImageDisclosure、TaskContext 由实验入口提供。三类对话组合实现位于 src/conversation，基础控件位于 src/components；基础层禁止反向导入对话层。对话外观单独导入 `@areal/ui/conversation.css`，仅在设计预览消费；当前生产页面不接入这些组合。

TaskContext 通过 Section、Item、Sources 组合变更、项目、子任务和来源。组件负责基本呈现与读取交互；真实状态、资源读取、窄窗导航与焦点恢复由宿主提供。其他控件及尚未迁入的领域组合继续归 renderer。开发前读取 [Agent 入口](agent-guide.md)，架构与取舍见仓库 D-004。

SubagentPanel 提供入口后的完整列表、按独立状态分区、完成组展开与历史详情返回；历史内容由宿主提供。ThinkingStatus 提供从左到右的思考扫描，减少动态效果时静态呈现，不可见或后台停止循环。两者同样为实验对话组件，仅设计预览消费。

ThinkingStatus 的 label 消费公开模型过程摘要并在变化时局部过渡，无摘要才回退 Thinking。任务上下文卡片由产品顶部按钮控制，与资源阅读器分开；具体优化依据见原对话流规范和参考记录。
