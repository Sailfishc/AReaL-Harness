---
id: task-context
title: TaskContext
summary: 按变更、关联项目、子任务和输入来源组织当前任务的上下文。
status: experimental
entry: wip
layer: conversation
---

# TaskContext 任务上下文

用于当前工作的对象和输入；全局最近项目、任意目录与模型自述不构成关联关系。原宿主提供准确的项目/Worktree 关系、子任务状态、变更范围、来源身份及合法动作。

## 组成

TaskContext 提供标题、宿主 actions、可选的返回动作和独立纵向滚动正文。Section 提供具名分区；Item 提供图标、名称、次级信息与末尾统计/状态；Sources 提供默认三项预览、查看全部和独立添加入口。组合使用 children；Sources 将真实条目交给 children 函数，保留原 id，不另建来源 DTO。

Changes 明确统计范围，工作区改动不自动归为 Agent 产出。关联项目按现有关系呈现，子任务保留独立身份和状态；父任务完成不意味着子任务完成。

## 来源集合

Sources 初始展开并最多显示三项；超过三项提供带总数的查看全部。零项显示空态；折叠时添加仍可操作。同名异源以 id 区分，不可用条目保留原引用和说明。图片、网页和文件只是输入类型；网页呈现不代表已实现抓取或持久化。

组件仅触发 onViewAll/onAdd/Item 动作；全部列表、详情及草稿由宿主拥有。默认列表在详情期间保持挂载，返回后保留折叠选择。

## 返回与可访问性

宿主使用 headingRef 聚焦新详情标题，返回后恢复原入口；原入口被移除时使用标题作为回退。窄窗显示/隐藏、返回对话、未发送草稿及阅读位置由产品布局负责，组件不猜测窗口宽度或请求焦点。具名 aside/section、独立按钮与 Sources 的 expanded/controls 保持可访问。

## 示例与边界

[独立包示例](../../../../../renderer/design-system.html?ui-library)和[对话组合](../../../../../renderer/design-system.html?conversation-system)分别验证独立外观和宿主适配。Props 从实际声明生成。实验组件没有 Core、Desktop bridge、项目扫描或生产接线。
