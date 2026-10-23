# Base beta 证据索引

目录中的证据 ID 统一指向本页。检查器路径是复验入口，运行编号才标识本轮结果。有限变体和状态不表示所有组合均已运行。冻结的实现提交见 [Base](base.md)，后续独立题目记录其实际输入的完整冻结提交。

## E-CONTROLS

先运行 `pnpm --dir clients/gui design:build`，再运行 `pnpm --dir clients/gui test:design`。

运行 `areal-design-system-Jurw3B` 通过 18 项检查，无页面错误或外部请求。覆盖基础控件键盘操作、明暗 14/18 字号、宽窄条件、长文本全文与焦点、反馈状态和审批防重复动作。原有过程展开位置断言曾失败，修复消息区的阅读意图后，原断言通过；未降低要求。减少动画的同场景诊断 `areal-design-system-yFX73p` 也通过。

以上浏览器运行的构建 SHA256 为 `b59d415ea128c0b00e02b8ca162e6442b86d2748641852394aae9c7b715d8827`。检查时 HEAD 为 `4b6ca881`，包含待提交的消息区与准入改动；实现提交另由冻结记录指明。用户首轮反馈只表示已体验范围与当时基准接近，不等于全状态认可。

## E-SETTINGS

复验入口同默认 `test:design`。`areal-design-system-Jurw3B` 挂载真实 SettingsPage 和 portal SettingsDialog，检查宽窄布局、明暗、14/18 字号、控件键盘、说明层级、状态与草稿、偏好重挂载和重载。既有设置题保留各自版本，不倒推成本轮输入。

真实 GUI 外观入口为 `AREAL_CORE_BIN=<匹配产物> node clients/gui/scripts/interaction-smoke.mjs --appearance-slice`。运行 `areal-gui-Bi1yh4` 通过主题与独立字号即时生效、重载持久化、同任务草稿、语义段落和底部跟随检查。Messages 源码 SHA256 为 `8297bc0e579da696ccca318a82d33cd5f57d4f7cb52a2d875499764ceca80fbc`。无页面错误，所持 Desktop/Core 已清理。

## E-DECISION

复验入口为 `pnpm --dir clients/gui test:design --decision-exercise`。运行 `areal-design-system-XltL0l` 通过 5 项检查，无页面错误或外部请求。长内容完整阅读、回执保留卡片、深色大字号窄容器、明确失败重试、处理中防重复与未知结果只核对分别验证。构建 SHA256 为 `e604fa1452d93319891f5ae4f9e3f075d20b46352ab13f5688dcc0cea450b8c5`。

这是本地模拟题，不表示真实供应商或全部权限组合已验证。

## E-CONVERSATION

复验入口为 `pnpm --dir clients/gui test:design --conversation-exercise`。运行 `areal-design-system-3rU8IG` 通过 5 项检查，无页面错误或外部请求，构建与 E-CONTROLS 相同。逐步投影、历史阅读与返回最新、终态收敛、人工详情、命令、图片、子对话及失败、未知和未结算分别验证。

较早题目对图片摘要点击的假设已不符合当前生产入口。修订只让题目使用现有图片预览与原始记录，不改变生产图片组件。完整 P-CONVERSATION 和资源宿主生命周期仍未准入。

## E-RESOURCES

复验入口为 `AREAL_CORE_BIN=<匹配产物> node clients/gui/scripts/interaction-smoke.mjs --resource-slice`。它验收生产文件与 Diff 返回，独立于本地数据管理模式，也不是安装包验收。

运行 `areal-gui-dbW7xH` 已通过。真实 Runtime 创建文件，回执路径、字节和 SHA256 一致；指定历史轮次的 Diff 排除既有无关 Git 修改。文件、Diff 转文件、面板关闭及顶部关闭均返回原任务入口。明暗、1440/980 宽度与独立字号条件保留草稿和当前段落；缺失文件保持身份并可返回、重新打开；切换新任务不重放旧提交。无页面错误，所持 Desktop/Core 已清理。资源实现进入 `e3f1a6cd`。

只覆盖真实结果入口与明确的工作区绝对路径。聊天 Markdown 相对文件链接的归一化限制保留；未注入迟到读取响应，未验收脏文件编辑生命周期。此运行不检验 P-RESOURCES 的搜索、列表、详情与加载状态，不能单独据此准入资源管理；当前插件子路径的有限准入另见 E-PLUGINS。

## E-PLUGINS

复验入口为 `AREAL_CORE_BIN=<匹配产物> node clients/gui/scripts/plugin-p0-smoke.mjs --resource-slice`。运行 `areal-plugin-gui-COHnGB` 通过 6 组检查，无页面或 Main 未捕获错误，自有 Electron/Core 自然退出。实现进入 `cc6e7738`。入口 HTML SHA256 为 `5dca73d613f19cad540ecf0d28db248ab12a6bccacadead0456e6da5ca2262f4`，该入口引用本次构建的 `main-BY8vMrQE.js`；源码摘要、构建入口及 Main 身份归原始 manifest。

个人市场搜索、空结果、键盘清除、刷新加载、可选 MCP/hooks 读取单独失败及刷新恢复已验证。项目停用的真实 Core 结果在响应阻塞期间已生效，界面禁用重复动作；启用响应丢失后沿原 requestId 核对，没有重放写入。过期 revision 的真实失败先返回 admitted/UNKNOWN，再显式核对原请求，展示明确失败并保留插件身份。列表返回保留查询和原行焦点；明亮 14 / 1440 与深色 18 / 980 条件保留原项目、任务、中文草稿、编号阅读段落和偏移、输入焦点，无额外任务轮次或模型请求。

初次基线 `areal-plugin-gui-kyGPtI` 复现目录阻塞时没有可见加载区域。修复后的验收曾因刷新未结束就注入下一故障，以及将 admitted 的过期配置误当成立即明确失败而中断；修正等待和核对步骤后通过，未改变 Core 合同或降低原断言。既有普通插件 smoke 的 setup 请求计数和详情脚本的连接文案基线仍失败，本轮没有以新增模式宣称它们通过。

只使用单个隔离本地插件；未检验长列表非零滚动、条目消失回搜索或项目切换迟到响应。已核对截图总览及加载、局部失败、列表焦点、深色大字号详情原图，未发现所示状态的阻断；视频分析工具不可用，使用本地原图、事件及权威结果核查，视觉基线仍待用户评价。仅准入插件目录、搜索、详情、当前项目启停及原提交核对与任务返回，不准入完整安装、认证或连接生命周期。

同一生产实现上的保留回归 `areal-gui-m2exF0`（任务）、`areal-gui-e5QzlL`（外观）、`areal-gui-QxSM5q`（文件与 Diff）均通过，所持 Desktop/Core 已清理。退出时既有通知拒绝日志仍保留，不宣称无后台告警。

## 来源与冻结边界

真实 GUI 使用隔离 Core `5d65fe53e6479fc42190745500a8047992db26b2460c83f2afe0fb4beeb424c7`。它从本设计 Worktree 的待提交合并源码构建，构建输入摘要为 `8f82738d1ef571931c50a552bf52c748aeae7c990412985d83909482433a128e`；build-info 的 sourceRevision 为 `572b31e1`、workingTree 为 true，不能仅以该旧 HEAD 代表产物源码。随后没有改动 Core/Runtime。

每次运行的原始 manifest、截图与日志保存在本机临时证据目录，记录源码摘要和实际构建。索引保留运行编号与摘要，公共文档不携带本机绝对路径、运行私有资料或凭据。

真实供应商、安装包、其他平台、完整自定义主题矩阵、完整 SidePane、P-RESOURCES 未列明部分和完整 P-CONVERSATION 不在本次冻结范围。Web 后续独立接入，CLI/TUI 不属于目标。冻结只为独立复用题提供固定输入，不表示稳定公共 API 或用户最终视觉认可。
