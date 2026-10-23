# 对话阅读组合合同

本次准入限于投影、阅读与展开收起。Core 拥有执行与历史权威；生产宿主拥有命令、附件、子面板与原生资源的生命周期。完整对话模式与 SidePane 不在 Base 范围内。

## Messages

[Messages.tsx](Messages.tsx) 由 [App.tsx](App.tsx) 挂载，在主阅读区或嵌入上下文中展示传入的任务投影。已受理占位、逐步内容与终态内容保留各自身份。阅读历史时保留可见内容锚点；显式返回最新后恢复跟随。阅读状态按 project/thread 隔离。失败、结果未知与完成分别表达。投影不重放未知是否受理的提交。传入回调继续拥有业务动作；只读消费者不会因此获得编辑能力。

## TurnProgress

[TurnProgress.tsx](TurnProgress.tsx) 由 Messages 使用，接收有序子项与摘要事实。未结算时默认展开，结算后可收敛。读者明确选择后，不再自动改变展开状态。没有可用摘要时保持展开。原生摘要按钮可通过键盘到达，并提供 expanded/controls 关系。子项保持挂载，查看历史不会重置详情或重放工作。失败与未完成提示来自调用方事实，不合成为成功状态。

## TurnExecution

[TurnExecution.tsx](TurnExecution.tsx) 由 Messages 使用，按顺序组织过程项。单个工具、思考组或纯 Agent 列表直接展示。有摘要的已完成回合，只有在没有失败或未完成项时才可自动收起。人工展开选择保留。分组摘要与活动区域可通过键盘到达；动画要求回合活跃、连接正常且没有待处理交互。失败或未知工作保持可见，不因出现最终消息而变成成功。

## ToolEvent

[ToolEvent.tsx](ToolEvent.tsx) 由 Messages 使用，提供有名称的摘要与保持挂载的原始记录展开区。Enter 或 Space 可切换原生按钮；expanded/controls 标识已支持的详情关系。运行中、完成、失败与未知标签来自现有展示所有者。文件、命令、图片与 Agent 入口交给各自原所有者。本次仅准入工具摘要与原始记录展开两种变体，不纳入宿主生命周期及全部工具专有变体。交互式结果入口仅在传入状态为 opening 时禁用，不据此判定执行完成。

## 证据与边界

[E-CONVERSATION](../../design-system/base-evidence.md#e-conversation) 映射本地 phased/legacy 过程与阅读题目。已完成检查必须列明实际条件，不代表全部状态与变体组合、原生资源焦点、重连、真实执行、供应商或安装包已验收。
