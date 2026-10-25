# @areal/ui：Agent 路径索引

普通页面使用 [包说明](README.md) 的使用与分层章节，随后读取所选组件的就近合同。Token 名称和数值从[生成参考](src/generated/tokens.md)查询。组件列表与入口以构建产物 `dist/components.json` 为准。

## 使用组件

| 本次任务 | 读取位置 | 完成判断 |
| --- | --- | --- |
| 选择组件、入口和实验名单 | [包说明](README.md#使用)与[成熟度](README.md#分层与成熟度) | 导入可以构建，实验使用有有效登记 |
| 设置、对话、Worktree 的有限状态与宿主职责 | 所选组件合同及其 related | 所需状态与合法动作均由真实宿主提供 |
| 混合消息内容 | [NativeContent 合同](src/conversation/native-content/native-content.md) | 未知输入保留原文，执行仍归原宿主 |
| 页面与真实桌面验收 | [完成条件](../../design-system/governance.md#完成条件) | 记录实际环境、证据、失败与未覆盖范围 |

## 修改系统

修改 Token、组件准入、跨组件规则或设计所有权时，进入[维护者入口](../../design-system/README.md#开工顺序)。实现与就近合同一起修改；生成文件从原脚本重建。边界与许可见[本地 UI 包决策](../../../../design/decisions/004-local-ui-package.md)。

## 容易带入的错误假设

Base 准入、包 API 稳定性与单次运行证据分别由原所有者维护，不能相互替代。执行、收据、UNKNOWN 核对、历史、凭据和本地化继续归宿主；包组件的有限局部交互以其合同为准。本页只路由，不重新定义这些规则。
