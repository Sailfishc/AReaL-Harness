**中文** | [English](multi-agent.en.md)

# Agent 委派与准入

默认模型工具 `agent_spawn/read/wait/wait_any/report/send_input/cancel` 使用 Core 的父子 Turn 和取消树。每个子任务只有显式输入和独立历史，共享工作区与部署权限。需要隔离写入与组合验收时使用 [Workgroup](workgroups.md)。

![任务生命周期](diagrams/task-lifecycle.svg)

[源文件](diagrams/task-lifecycle.drawio) · [准入图](diagrams/agent-admission.svg) · [准入源文件](diagrams/agent-admission.drawio)

## 所有权与结算

模型派发的子任务可异步推进；父任务按完成顺序增量接收结果，正常结束前自动等待全部子任务并汇总。等待不持有模型/普通工具许可。RPC 手工派发保留父 Turn 结束取消子任务的语义。取消、超时与失败向后代传播，终态在资源关闭和持久化完成后发布。

`agent_report` 将 summary、evidence、remaining 写入历史，不结束任务。失败任务可交回最近报告，保留失败状态与 partial 标记；正常完成优先返回更新的最终回复。阶段报告不能替代独立验收。子任务仅可由绑定父 Turn 控制，不能在结束后脱离父任务另开 Turn。

## 独立限额

| 配额 | 默认值与语义 |
|---|---|
| `max_threads` | 20000，含历史 Thread 元数据；归档仅释放热历史 |
| `max_active_turns` | 256，包含模型排队、工具等待和清理 |
| `model_concurrency` | 32，仅覆盖在途模型请求 |
| `max_children_per_turn` | 64，累计成功创建的直接子任务，不因子任务完成返还 |
| `max_agent_depth` | 8，根深度为 0；与扇出任一设 0 禁用委派 |

子 Thread 与首个 Turn 原子准入和持久化；失败不留空会话。容量不足立即拒绝，不占着父任务等待。清理或最终保存失败时保留活动占额，直到 Engine 结束并恢复；重启校验父子图但不自动恢复执行。

模型声明工具不保证会使用并行。共享工作区仍需划分不重叠写职责；宽度、真实模型请求重叠和任务收益分别测量。参数、分页和错误见 [Core API](../api/core.md#agent-tools)。

`agent_send_input` 是协作补充，不是紧急取消。Core 排空已发出的子任务模型请求以结算用量，再应用新输入；旧响应的工具不会执行。首包前等待沿用请求空闲期限，流式等待在每次活动后刷新空闲期限，并受原 Goal/worker 截止时间约束。显式取消仍可打断等待；缺失用量或超时保留 UNKNOWN，不伪造已结算。

正常接管使用 `agent_cancel` 的默认 graceful 模式，强制停止显式传 force；精确期限和回执见 [Core API](../api/core.md#子任务停止与计量收尾)。父作者比较源码变化、验证输出和快照 activity，并使用完整 threadId 与约定交接路径。Core 先封闭后代准入，再传播取消；Turn 保留有界模型结算所有权，结算后继续既有资源清理与共享 Goal 门禁。资源释放和 usage 完整性分别报告，UNKNOWN 不因接管被清除。
