---
id: subagent-panel
title: SubagentPanel
summary: 从分状态列表进入子任务历史，返回保留展开、滚动和焦点。
status: experimental
entry: wip
layer: conversation
category: agents
aliases: ["子代理面板"]
related: ["task-context", "activity-group", "thinking-status"]
---

# SubagentPanel 子代理面板

## 何时使用

任务上下文 Subagents 入口 → 全部列表 → 某个子代理历史 → 原列表；时间线具名子任务也可直接进入该历史。不是将详情写成一段总括说明。

## 组成

列表/详情共享标题、返回和关闭；Active、Needs attention、Done 分区，行含头像、状态图标/文字及已知时间；历史由宿主 children 提供。

## 状态

运行、已确认完成、需要核对分别呈现。Active 为零有明确空态；完成组初始十项，过多时展开/收起。十项是局部展示选择。

## 行为

选择进入同一对象历史，返回保留列表展开、滚动和原行焦点；关闭由宿主恢复上下文卡片和原入口。open=false 不抢焦点。

## 内容

历史显示请求、过程、活动及最终结果；运行可显示公开模型摘要，无摘要才回退 Thinking。完成用已确认结果，未知说明待核对。时间来自原记录，不生成伪计时。

## 可访问性

打开详情聚焦标题，返回聚焦原行。状态同时有图标与文字。列表/历史各有独立纵向滚动，窄窗保持返回和关闭可达。

## 规则

父任务完成不改写子任务状态。阅读不提交或重试。此预览只有固定历史，无真实子代理/Core 接线，不代表完整 Codex 能力。

## 示例

[组件目录与生成API](../../../../../renderer/design-system.html?ui-library#component-subagent-panel)；[对话组合](../../../../../renderer/design-system.html?conversation-system)。文档站会嵌入该组件的独立可操作示例，原文与实现同目录，Props不另抄一份。
