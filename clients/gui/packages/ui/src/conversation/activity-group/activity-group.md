---
id: activity-group
title: ActivityGroup
summary: 默认收起连续活动，纵向阅读原记录，关键状态始终可见。
status: experimental
entry: wip
layer: conversation
---

# ActivityGroup 活动分组

用于同一轮、同一项目内连续活动的按需阅读。单项活动直接呈现；不跨用户消息、助手说明或最终回答做合并。实际分组和事件身份归原投影，组件不解析命令猜测类型或执行次数。

## 组成与状态

具名摘要、可键盘到达的有界滚动区、摘要外的 status 插槽。children 保留原顺序，调用方用原始事件 ID 作 key。默认收起，手动选择在同一实例中保留；父组收起保留子详情。对象切换以原对象 ID 重建组件，不按运行/完成状态更换 key。

status 用于当前进度、失败、待审批或 UNKNOWN 的准确说明及合法阅读入口，始终在折叠区之外。运行和完成只更新内容，不控制展开状态。展开、收起和查看不执行或重试命令。

## 溢出与可访问性

列表只有纵向滚动，摘要在列表之外；长命令、代码与路径换行，原始复制内容由宿主保留。嵌入的专用阅读器也须遵守这个约束，不能用裁切代替完整阅读。组件内高度上限是局部布局选择，不登记为全局 Token。

沿 Disclosure 的按钮语义与键盘行为；滚动区可聚焦。宿主负责条目的可访问名称、状态含义及合法动作。

## 示例与边界

[独立包示例](../../../../../renderer/design-system.html?ui-library)使用普通文本活动；[对话组合](../../../../../renderer/design-system.html?conversation-system)使用原 ToolEvent 适配。二者消费同一实验导出及 conversation.css，未接入生产页面。Props 与默认值读取生成 API。
