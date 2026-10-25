---
id: collapsible-text
title: CollapsibleText
summary: 长正文的渐进阅读。
status: experimental
entry: compositions
layer: conversation
category: composition
aliases: ["长正文的渐进阅读"]
related: ["button"]
exports: ["CollapsibleText"]
---

# CollapsibleText 长正文的渐进阅读

## 何时使用

长正文的渐进阅读。沿现有生产用途，不新增业务入口。

## 组成

本合同覆盖CollapsibleText；完整Props从同目录生成TS API读取。

## 状态

默认、内容增长、禁用/忙碌（由宿主提供）、明暗与不同字号；展示更新保留原身份与阅读状态。

## 行为

保留原实现和键盘/焦点/滚动语义。原renderer适配提供翻译、偏好与合法动作；UI包只呈现与管理本地交互。

## 内容

名称、原因与结果来自宿主事实；未确认不能显示为成功，短时通知不替代原始结果与恢复动作。

## 可访问性

真实控件保留label、aria、ref和键盘入口。18px字号和窄窗保持内容可读，焦点不因重新包装而丢失。

## 规则

包不依赖renderer、Intl、Store、Core或Electron。原路径仅转接或注入宿主数据；API 保持 experimental；Base 准入不自动提升稳定 API。

### GUI 接线

共享阅读方式、全文与原文关系由[深入查看与返回](../../../../../../../design/patterns/inspect-and-return.md)维护。本节定义 GUI 的组件、测量、焦点与例外接线。

- **按实际布局折叠**：根据渲染高度判断，覆盖 Markdown、多行与自动换行；宽度、字号或字体变化后重新测量，不只按字符数判断。短文本完整展示，不出现无效展开入口。
- **预览与全文可逆切换**：默认保留开头预览，提供始终可见的“展开全文 / 收起”按钮；按钮位于裁剪区域之外，不能只在 hover 时出现。聊天默认预览约 8 行，数值归 [CollapsibleText.css](../../../../../renderer/src/CollapsibleText.css)。新消费者优先复用 [CollapsibleText](../../../../../renderer/src/CollapsibleText.tsx)，不要另写字符截断或折叠状态机。
- **全文完整可达**：按[共享阅读规则](../../../../../../../design/patterns/inspect-and-return.md#长内容与全文)处理原文；GUI 将附件和独立操作放在正文预览之外。展开后使用所属页面滚动，不再嵌套纵向滚动；收起时保持阅读位置与按钮焦点可达。
- **可访问且稳定**：原生按钮支持键盘、可见焦点、`aria-expanded` 与 `aria-controls`；聚焦裁剪正文内的操作时先展开。每条消息独立保存当前挂载期间的展开状态，流式刷新或尺寸变化不覆盖人工选择，换到其他消息不继承旧状态。不依赖动画表达状态，遵守 reduced motion。
- **按任务设定例外**：正在编辑的输入、流式主要回复、需要完整核对的审批关键信息以及专用文件/日志阅读器，保留其现有阅读机制；不能为了统一外观隐藏完成当前任务必需的信息。未来长文本设计评审必须说明所选机制与可达全文的路径。

已发送消息在共享 `Messages` 中应用此规则，主聊天、Side 与 Remote 复用同一展示路径。验收至少覆盖长/短文本、连续长段落、Markdown、明暗、窄宽面板、字号变化、展开再收起，以及原文复制。生产组件预览与脚本见下文；它们不代替真实服务或安装包验收。

## 示例

[组件目录与独立实例](../../../../../renderer/design-system.html?ui-library#component-collapsible-text)消费同一包实现。真实服务、持久化和桌面生命周期由原专项验证。
