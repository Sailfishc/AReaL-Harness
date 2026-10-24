---
id: button
title: Button
summary: 发出一次动作或打开入口，外观不代表业务已经受理。
status: stable
entry: index
layer: core
---

# Button 按钮

用于执行一次动作或打开入口。持续状态选择使用原 Switch，值选择使用原 Select；业务决定何时允许动作。

## 组成与状态

基于 Base UI Button 的具名按钮。保留现有 AReaL variant、size 和 render 接口；参数、默认值和联合类型从 TypeScript 生成到组件目录，避免手抄接口表。

## 行为与可访问性

Tab 进入可用按钮，Enter/Space 触发。disabled 时不可执行；纯图标按钮由调用方提供 aria-label。返回、提交与结果未知由消费方处理。

## 视觉来源

有限样式由本组件的 cva recipe 和包内语义 Token 决定。默认外观保持既有值；调用方选择已有变体，结构与状态说明保持可读。

## 示例

[包与组件示例](../../../../../renderer/design-system.html?ui-library)。
