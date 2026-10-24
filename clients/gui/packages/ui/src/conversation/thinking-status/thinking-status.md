---
id: thinking-status
title: ThinkingStatus
summary: 正在思考的可读提示，文字亮度从左到右扫过。
status: experimental
entry: wip
layer: conversation
---

# ThinkingStatus 思考提示

只在宿主确认正在等待生成或思考时呈现；不能把进程执行、等待审批或结果未知一概写成Thinking。结束时由宿主移除，不显示伪造百分比或时长。

底层文字始终可读，叠加一次从左到右的亮度扫描；当前1.8秒周期是实现选择，静态参考图不提供精确节奏。该动效是用户明确要求的工作中反馈，不用于其他静态正文或标题。

减少动态效果或系统prefers-reduced-motion时保留静态文字，移除扫描。不可见、收起或后台标签时停止循环。状态只向辅助技术播报一份，扫描层aria-hidden，不逐帧更新文字。

[对话预览](../../../../../renderer/design-system.html?conversation-system)与[组件站点](../../../../../renderer/design-system.html?ui-library)使用相同实验导出和conversation.css；不代表真实模型调用或生产接线。
