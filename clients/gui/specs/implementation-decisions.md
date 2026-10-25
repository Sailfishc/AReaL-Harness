# 实施前的源码核查

本记录区分原 spec 的目标、源码已经提供的机制和仍需取证的判断。核查基线是 `44e3b0fab3c0eef15c871e06f811c47d5a6afd66`，其中已集成 `fccf3ddd` 的 spec、`8f88fe05` 的延迟加载与依赖补丁，以及 `4cb881d8` 的定时任务体验。它不表示全部整改或安装包验收已经完成。

## 入口与准入分别建模

[Base](../design-system/base.md) 的 `frozen-beta` 固定特定 GUI 切片，不承诺稳定公共 API。`Feedback`、`ApprovalRequest`、`Messages`、`TurnProgress`、`TurnExecution`、`ToolEvent` 仍由 Renderer 所有。因此 D1 不能用“所有 Base 成员必须是包导出”的集合断言。

实施沿用组件合同的 `entry`、`status`、`layer` 和 `exports`，以及 GUI registry 的准入成员表。已准入且确实由包实现的组合可进入 `compositions`，未准入成员保留实验身份。Renderer 成员不因本次入口拆分迁入 UI 包。导入迁移按符号分类，不能把整个 `wip` 入口直接改名后宣布稳定。

## IPC 校验覆盖路由映射

`vite.config.mts` 的 `types-suite` 已经通过 `allowJs` 和 `checkJs` 检查 `packages/workbench/client/desktop-contract.cjs`。E2 的缺口是 Main 检查覆盖和尚不精确的命令参数，不是完全没有契约类型检查。

Main 的 `areal-core:command` 是一个分派通道。Desktop 命令、IPC 通道和 Rust RPC 方法属于不同命名空间，部分命令只在 Desktop 处理。E2 的一致性约束需要检查每条路由的归属、校验和分派覆盖，不能要求这几个名称集合相等。保留现有校验器和 JSDoc，避免为了类型新增第二套运行时 schema。

## 保留尚未归因的 macOS 启动边界

`0ac4eeff` 引入桥接路径时，记录过同一原生产物直接启动被 SIGKILL、通过 Python 成功，之后直接启动也成功。该证据不能把发送信号的一方归因为 AMFI、TCC 或某个安全产品，也不能证明另一个同 Team ID 原生 helper 能替代系统解释器。

Python 的产品调用还分布在 `core/service-host/src/launcher.rs`、`runtime/client/src/lib.rs`、`runtime/exec-native/src/lib.rs` 和 `core/server/src/trajectory/mod.rs`。只替换 E1 列出的 GUI 与 local-service 两个入口不足以删除安装指南中的运行前提。共享服务 launcher 已有实际启动前探测，PID 握手失败则是另一种启动后故障，二者不能混称预检。

本次不在缺少根因、干净 macOS 环境和签名包证据时改变父进程身份、权限归属或沙箱。宿主依赖检查复用 `scripts/package.py` 中的 prerequisites，不从安装指南正文重新解析一份清单。E1 的原生桥替换仍以职责清单、进程结算和真实分发环境验收为前提。

## 指标排除预览并复用现有审计

G0 和 D2 的生产范围排除设计系统预览、生成物和 vendor。原 D2 的 TSX、CSS 统计包含预览，不能作为生产采用率基线。采用率沿现有 `design-system-maturity.mjs` 的本地重导出追踪，而不是只计算直接 import 字符串。归档后的设计文档也不计入活跃文档字节数。

D3 的语义色已经通过 `foundations.mjs` 出现在生成的 Token 参考中，缺口是派生关系的结构化描述。主题重构前须保存真实浏览器解析后的颜色，不能把 `color-mix` 源码字符串相等当成视觉验证。

D4 已有默认正文对比度检查、负例、部分键盘路径和 reduced-motion 验收。新增门禁扩展这些所有者，明确文本与背景配对，不穷举无效的 Token 笛卡尔积。自定义主题和 VoiceOver 体验单独报告。

D5 已有使用者与维护者入口，以及规则 ID 与唯一来源检查。继续收敛现有 registry 和文档所有者，不建立第二份规则库。不能仅为达到文档体积目标而把当前合同移进归档。

## 已有延迟加载先保留

本次合并的 `138b267b` 已将终端和 Markdown 编辑器改为按需加载。E6 先分析集成后的真实构建图，再选择候选库。初始预算记录优化后的实测字节数及入口依赖闭包，冷启动数据保留机器与运行条件，不宣称 CI 或其他平台已经通过。

## E1 阶段 0 的依赖准入

GUI 在附着原后台后才判断是否需要新启动，只有新启动进入依赖预检。安装包复用 Core manifest 的 prerequisites，开发版使用现有启动桥固定的系统 Python 路径。预检先验证所选开发工具包含解释器，再有界执行系统 Python。开发工具缺失或选择失效时直接返回结构化引导，避免以执行 Python 桩作为唯一探测。这个顺序明确修正 E1 D1 中“总是执行 Python”与“首次启动不打开系统安装器”的冲突。

安装操作只由用户点击触发固定的 `xcode-select --install`。重新检测沿用显式连接入口。测试注入函数依赖边界，不增加产品可执行路径环境变量。已有后台附着、Core 与 Runtime 生命周期、父进程身份和沙箱保持原所有者。阶段 0 fixture 与浏览器引导验收不能证明历史 SIGKILL 根因，也不代表干净 VM 或签名分发包验收。

## E1 与 E2 spike 的结论

原生启动夹具在同一主机出现了可区分的结果。Developer ID 签名且启用 hardened runtime 的 Node 直接启动 ad-hoc C 夹具成功。C 夹具再以 `posix_spawn` 启动自身时，父进程取得真实子 PID，并在 `waitpid` 后记录信号 9。子进程没有输出第一条报告。系统日志没有把这次终止绑定到 AMFI、TCC 或其他发送者。矩阵在该失败处停止，全部试验进程已退出。没有改变签名、quarantine、系统安全设置或产品启动路径。

这份证据支持保留 E1 阶段 0，不支持接入原生替代桥。六条 Python 调用路径分别拥有不同的 FD 白名单、组与会话、owner-death、PTY 和退出回执合同。后续候选须先在干净 macOS VM 中归因，再以签名分发产物验收这些合同。不能用父进程的一次成功退出代替真实子进程及 Runtime 的清理回执。

E2 的响应类型原本停留在契约声明中。原生 TypeScript 7 编译实验只重命名 `PrepareCreatorResponse.skill` 时，原 Renderer 没有诊断。采用现有校验器的 assertion 签名，并在包装出口与 `services.ts` 传播 `CommandResponse` 后，相同变更在实际 `App.tsx` 消费点产生一条诊断。五个错误请求与五个错误响应均被编译器拒绝。合法样例和完整 Renderer 检查通过。未经校验的 transport 仍返回 `unknown`，未建模命令保持既有签名。

全 Main 检查探针仍有 4,750 条自有诊断，涉及 97 个文件。这不是独立缺陷数量，也不能用批量 suppression 处理。严格检查还会进入生成包与导入类型图。当前六个已检查 Main 模块与五类响应传播属于首个切片，不表示 E2 全量完成。

## 首次健康基线与构建预算

首次健康基线在增量格式检查之后建立。现有 `main.cjs`、`preview.cjs`、`service-client.cjs`、`Composer.tsx` 与 `WorktreesSettings.tsx` 被仓库格式器展开，物理行数不能与旧排版直接比较。首次基线明确记录该排版差异。后续同路径只允许减少，新增或改名的生产文件仍受 800 行上限约束。此例外不适用于新增模块，也没有放宽采用率、测试注册或其他指标。

E6 使用 Vite 实际产物的静态导入闭包计算初始 JavaScript，包含 HTML modulepreload。完整 Markdown 渲染器在需要时加载，等待时保留原文，失败时显示转义后的原文。终端与 Markdown 编辑器的既有延迟边界保留。产物字节预算不能证明冷启动耗时改善，启动时间和内存仍需要固定环境的独立测量。

## 当前验收边界

本次检查包括类型、公开边界、脚本注册、定向回归、浏览器启动恢复与设计系统流程，以及与源码输入哈希一致的真实 Electron/Core 对话。确定性本地模型不等于真实供应商验收。Linux job 已配置，尚无远端 CI 执行证据。

D4 的 axe 与主题配对矩阵先以报告形式接入。已有主题包含严重对比度节点和未达阈值的配对，不能在保持颜色的本轮迁移中宣布全部通过。VoiceOver、Windows/Linux 桌面、干净 macOS VM、签名安装包与公证均未验收。E3/E4 的领域拆分、D2 的全量样式迁移、D3 的派生公式迁移与 D5 的 Agent 对照实验也仍有后续切片。

## E4 spike 保留实时资源所有者

只读审批计划、批量调用防重放记录和截图守卫不是同一种生命周期。Agent 截图在发布前停止守卫，人工标注在发布后继续持有，授权 iframe 截图则在固定 contexts 上逐一清理。`documentReady` 等待允许同源导航，但元素 Ref 和截图坐标不能继承该豁免。撤权须先同步增加 control epoch、清理计划并隐藏视图，再等待输入与释放回执。

现有合同与 source characterization 覆盖这些顺序中的只读计划部分。删除计划消费语句的隔离变体被重复执行检查捕获。整页 reducer 会增加 effect queue、操作身份和回执迁移，当前证据不足以承担这项改写。因此本轮止于已有纯模块抽取，不用 mixin、方法绑定位移或巨型 context 参数凑行数。

后续最小切片是只读计划的构造和匹配规则。Map 删除位置、实时 owner 检查与所有 await 保留在 Main。现有诊断中的 60 秒定时偏差不等于事件循环 p99；实际 Main histogram 尚未测量，不能据此引入 `utilityProcess` 或宣布无需隔离。
