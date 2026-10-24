# @areal/ui：Agent 使用入口

新增基础控件、调整基础值、采用包内组件或评审这些变更时，从本页开始。包内版本与可用导出读取 package.json 和生成的 components.json；先区分稳定与实验入口。

## 使用组件

1. 从 [GUI 设计入口](../../design-system/README.md)确定用户意图与所属模式；在 `@areal/ui/components.json` 索引里选择已有组件，读取就近 Markdown 合同。完成条件是用途、必要状态和返回行为明确。
2. 稳定组件从 `@areal/ui` 导入；实验组件从 `@areal/ui/wip` 导入。类型由实际源码和生成的 `.d.ts` 提供，目录示例消费相同导出。
3. 用内容、children 和已有有限变体完成组合。调用方提供真实值与合法动作，通用控件只负责呈现与交互。业务执行、凭据、历史和权限继续归原服务。
4. 先验证所选状态，再接生产。主题、字号、键盘和窄容器按实际风险检查；预览结果与真实桌面、Core、安装包分别报告。

## 修改系统

1. 默认基础值编辑 tokens.json；动态调色板派生编辑 src/theme.ts；用户偏好的读取、保存与应用仍在 renderer 的 applicationSettings/applicationPreferences。
2. 修改组件时同改旁边的用途、理由、状态与可访问性合同。Props 从 TypeScript 读取，语义值使用既有角色；组件的基础外观由其 recipe/CSS 自身完成。
3. 运行包的 generate、build 和 check，再运行 GUI 的 verify:design、typecheck 与受影响浏览器专项。生成漂移必须修源后重建；保留失败证据。
4. 改变边界、主题语义或公共规则时更新原设计文档/决策。稳定 API 的调整检查旧消费者；实验组件提升前需要真实消费者和验收依据。

## 容易带入的错误假设

| 情况 | 本项目的采用方式 |
| --- | --- |
| 看到 Raft 的品牌值就搬入 AReaL | 保留本项目的角色与默认值，采用其工程组织方法 |
| 使用 Radix 的 asChild 写法 | Base UI 组件沿真实类型使用 render |
| 页面 className 才补齐组件基本外观 | 基本外观放在包内，调用方只处理任务布局 |
| 在目录里登记就算稳定 | 实验入口、有限 Base 准入与单次运行结果分别维护 |
| 相同文字意味着相同执行状态 | 使用原身份与权威投影；查看不重试未知写入 |

本包覆盖 Button、实验 Disclosure、首批基础值和默认主题输入；实验对话层提供 ActivityGroup、ImageDisclosure、TaskContext（Section/Item/Sources）。对话组件从 wip 导入，样式另导入 conversation.css。基础层不能反向导入对话层；对话层不能导入 renderer、Core、Node 或 Electron。

对话组件由设计预览与生产对话共同消费：ActivityGroup 的 status 放在折叠外，ImageDisclosure 接受宿主确认的可用性，TaskContext.Sources 只展示三项并触发宿主的查看全部/添加动作。同一对象更新保留组件 key；对象切换按原 id 重建。宿主负责窄窗、真实资源阅读、焦点返回及草稿。生产适配归TurnExecution、ToolEvent、ConversationStatusCard及AgentsPane/AgentHistoryPane，继续使用原Core投影、资源读取和SidePane导航。其他控件及领域组合沿原目录查找，不创建同名替代品。包设置 private，分发边界是本地 workspace，发布需另行授权。

子代理入口使用 SubagentPanel 的列表→历史→返回动线，读取原子任务状态，不使用父任务完成状态生成Done。列表展开和焦点归组件，历史与区域布局归宿主。ThinkingStatus 的 label 用于公开模型过程摘要；无摘要回退Thinking，完成/未确认时移除，不把等待审批或未知结果写成Thinking。卡片从产品顶部入口开关，不作为永久资源侧栏。

组件MD须与实现同目录，含用途、组成、状态、行为、内容、可访问性、规则及可操作示例链接；category/aliases/related供人和Agent检索。数组使用行内JSON，关联使用已有组件id。MD、TS声明与独立示例各自拥有事实，生成的索引/原文站点不反向编辑。文档阅读器可检查元数据和实际示例；仅有MD文件不等于文档完整或体验已通过。
