# AReaL Design Docs

这里是 AReaL 共享设计知识的地图，供设计师、客户端工程师和 Agent 使用。它统一组织设计原则、用户意图、Token 语义、组合模式与决策，再指向 GUI、CLI、TUI 和 Web 的实现及验证位置。

本目录默认使用中文，服务内部设计协作。面向外部用户的使用与 API 文档继续由 `docs/` 维护。本轮建立共享入口和演进草案，没有迁移产品代码或批准新的视觉基线。

## 按问题读取

| 要解决的问题 | 共享设计所有者 | 实现与平台约束 |
| --- | --- | --- |
| 为什么这样设计，哪些取舍跨客户端成立 | [设计原则](principles.md) | 平台规范引用原则，保留本端适用条件 |
| 用户要完成什么，哪些事实必须可理解 | [设计意图](intents.md) | GUI 交互族、TUI 操作、CLI 输出和 Web 页面各自表达 |
| 文字、状态、颜色和密度的角色是什么 | [Token 与平台映射](tokens.md) | 具体数值和偏好沿当前代码所有者维护 |
| 共享知识、组件和产品如何依赖 | [设计系统架构草案](architecture.md) | 通用语义与各端实现分开，运行权威沿原有服务 |
| 已经选择什么，何时重新评估 | [设计决策](decisions.md) | 技术执行架构仍见 [系统架构](../docs/design/architecture.md) |
| 从 Raft 和本地设计交付吸收什么 | [设计来源](references.md) | 不把参考效果、独立模拟或旧源码当成当前验收 |

共享模式先在[设计意图](intents.md)记录需要保持的交互结果。具体布局仍沿已存在的客户端规则。出现已验证的跨端共性时，再将该规则迁入共享所有者，原文改为引用，避免两处维护。

## 客户端地图

| 客户端 | 现有设计与实现入口 | 本轮边界 |
| --- | --- | --- |
| 桌面 GUI | [GUI 设计入口](../clients/gui/design-system/README.md)、[组件指南](../clients/gui/DESIGN_SYSTEM.md)、[生产目录](../clients/gui/design-system/inventory.md) | React 控件、布局、窗口与原生视图的适配和准入 |
| Remote Web | [RemoteWorkbench](../clients/gui/renderer/src/remote/RemoteWorkbench.tsx) | 已复用部分 GUI 组件，浏览器权限与偏好仍有独立边界 |
| 本地 Web | [界面](../clients/web/app.js)、[样式](../clients/web/style.css) | 独立实现，不等同于 Remote Web，也未完成 GUI Token 接线 |
| TUI | [主题](../clients/tui/src/theme.rs)、[UI](../clients/tui/src/ui.rs)、[设计说明](../docs/design/tui.md) | 终端颜色能力、字符布局、键盘和阅读连续性 |
| 非交互 CLI | [输出所有者](../clients/cli/src/run.rs)、[CLI 契约](../docs/api/claude-cli.md) | 文字输出、机器输出和退出语义，不能套用桌面组件合同 |

设计地图提供导航，不生成页面或改变执行语义。目录存在不证明消费者已迁移。具体交互、平台和包的验证仍由相应客户端报告。
