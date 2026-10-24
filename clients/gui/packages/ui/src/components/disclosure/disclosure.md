---
id: disclosure
title: Disclosure
summary: 原地展开附加信息并保留同一组件身份下的阅读选择。
status: experimental
entry: wip
layer: core
---

# Disclosure 折叠

用于按需阅读一段内容。一次性动作使用 Button，持续资源阅读使用原资源面板；折叠不改变后台执行。

## 组成与变体

Root、具名 Trigger、指示箭头与 Panel。textRole 选择内容附注或界面标签；displayLabel 允许精简可见名称，同时保留完整可访问名称。基础外观与箭头由包内样式负责。

## 状态与行为

默认收起。手动展开选择保留到同一实例结束；keepMounted 用于父组关闭后仍需保留的子详情。消费方将失败、未知与待决定信息保持在可发现位置。

## 可访问性

Base UI Collapsible 提供 Enter/Space、expanded/controls 与隐藏内容的焦点约束。调用方提供可理解标签；资源关闭后的宿主焦点由消费方拥有。减少动态效果沿现有偏好生效。

## 示例与范围

[独立组件示例](../../../../../renderer/design-system.html?ui-library)与[对话组合](../../../../../renderer/design-system.html?conversation-system)。组件仍从 wip 导出；浏览器样例不代表生产对话、Core 或安装包已迁移。
