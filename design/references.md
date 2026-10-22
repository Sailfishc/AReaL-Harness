# 设计来源

本文件记录共享设计研究的来源。平台取证与采纳结果仍由相应客户端保留。

## Botiverse Raft：设计知识、组件实现与生成视图

本节对应本次指定的 `botiverse/raft-design`，与 GUI 参考记录中的 Raft Flutter 分别记录。2026-10-22 核对源码版本 `4f3b57de6802c9a1b234f6739dc578e5d58011cd`。公开中文站本次未能通过网页读取工具访问，以下结论来自仓库源码，不声明已进行站点视觉审查。

| 依据 | 可借鉴的机制 | AReaL 的取舍 |
| --- | --- | --- |
| [文档组织](https://github.com/botiverse/raft-design/blob/4f3b57de6802c9a1b234f6739dc578e5d58011cd/design/authoring/README.md) | 跨组件理由归设计指南，单组件合同邻接实现，数值、接口与示例由各自源码提供 | 沿现有规则和组件所有者渐进整理，不整树复制文档 |
| [组件分层](https://github.com/botiverse/raft-design/blob/4f3b57de6802c9a1b234f6739dc578e5d58011cd/design/components/overview.md) | 通用组件与携带产品概念的组合分开，通用组件不反向导入领域组合 | 沿用公共控件与 AReaL 组合，执行事实仍归 Core 和既有控制器 |
| [Token 来源](https://github.com/botiverse/raft-design/blob/4f3b57de6802c9a1b234f6739dc578e5d58011cd/design/foundations/tokens.md) | 声明源生成 CSS 与工具可读数据，拒绝派生物漂移 | 保留 AReaL 动态主题和偏好链，先明确角色所有者，暂不引入另一套 DTCG 编辑源 |
| [Agent 索引生成](https://github.com/botiverse/raft-design/blob/4f3b57de6802c9a1b234f6739dc578e5d58011cd/apps/doc/scripts/build-llms.mjs) | 同一内容生成 Markdown 页面、组件目录和检索索引 | 先复用 registry 与现有预览，有实际检索需求后再增加派生格式 |

这些机制是[共享设计系统架构草案](architecture.md)的输入。Raft 的视觉品牌、头像、字体与产品模型不进入本次迁移。其[素材说明](https://github.com/botiverse/raft-design/blob/4f3b57de6802c9a1b234f6739dc578e5d58011cd/NOTICE.md)也区分代码文档、字体和品牌资产的许可。

## 本地独立设计交付

本次读取 `areal-design-delivery`，其来源源码固定于 `a525d953442dbde6e85d15c0127b3fe963c56e19`。`design-project/FREEZE.json` 的 SHA-256 为 `31b3a11b97a1d25965e406eb5be175f6c789b1b53567e202a80f762a237c9e59`。2026-10-22 只读复核了全部 14 个冻结文件，字节匹配。原包与原始评判材料保留在本地，不迁入公开源码。

采纳方向是原则与理由、组件输入和动作、身份与状态合同、冻结输入和独立评判。Token 文件区分提取值与布局、色板提案；独立前端使用模拟事件。v1.1 增补未重新冻结，浏览器交互与真实平台验收仍有缺口。因此本地交付提供设计输入，不自动成为当前产品规范或缺陷证明。

## 平台参考与验收

已有 Cindy、Raft Flutter、Codex 有界观察和 GUI 采纳记录继续见 [GUI 参考记录](../clients/gui/design-system/references.md)。Botiverse Raft 与 Raft Flutter 是分别核对的来源。GUI 的视觉和交互继续以 Codex App 为第一参考。CLI、TUI 与 Web 的共享语义和平台差异必须核对各端实现，不能由 GUI 观察直接推出。
