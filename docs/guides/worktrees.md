**中文** | [English](worktrees.en.md)

# 桌面 Worktree

桌面新会话可以选择同一 Git 仓库中的来源 Worktree、起始分支和新分支名称。每个隔离目录使用独立的 Core 与 Runtime，侧栏仍在原逻辑项目中显示线程。新会话的工作区准备发生在首条消息执行前，已有会话不会透明搬迁。

## 新会话的工作区选择

新会话 Composer 旁的“自动隔离”打开“新会话工作区”。自动模式允许没有其他占用的首个根会话使用来源目录。来源已有根会话，或其他已登记项目指向同一 Git checkout（包括其子目录）时，新的普通根会话先创建独立 Worktree，再创建线程。这一选择比推测模型是否准备写文件更保守，也避免模型读过共享目录后才更换工作区。

“新 Worktree”模式可以指定来源 Worktree、起始分支和新分支名称。来源必须属于同一个 Git common directory。宿主先把来源 ref 解析成固定提交，再创建新的命名分支。创建不隐式联网 fetch，来源提交须已存在于本地仓库。它不复用被占用的目标分支，不强制覆盖目录，也不静默改成 detached HEAD。来源项目位于仓库子目录时，新的执行根保留相同相对目录。选定提交没有该目录时，准备失败。

“Worktree 默认配置”保存根目录和分支名称前缀。空根目录使用桌面数据目录下的 `worktrees`。默认前缀是 `areal`，留空的新分支名称按前缀和请求 UUID 生成。配置只影响未来创建，不移动现有目录、不修改已有分支，也不扩大已启动 Runtime 的权限。

取消选择浮层保留会话草稿。点击“使用此选择”只保存新会话选项，不创建目录。发送首条消息后，宿主才受理创建请求。关闭浮层或窗口不等于取消已受理的 Git 操作。

## 来源改动与兼容性

新 Worktree 只包含选定提交。来源的 staged、unstaged、untracked 和 ignored 内容均不复制，来源 HEAD、index 和文件保持原状。宿主不自动 stash、commit、运行项目 setup 脚本或执行 Git hooks；也不自动复制 `.worktreeinclude` 所列文件。新宿主使用当前部署的全局或默认资源，不复制来源项目专有的 Skills、MCP 或 Profile。指定资源在新宿主不可用时，创建不能静默改用来源目录。

旧 `source: "working-tree"` 快照入口会创建临时 Git 提交。该模式现明确拒绝并提示选择提交或分支，不再沿用“包含未提交的改动”的旧含义。已有 Worktree 和旧创建记录保留，不自动删除或搬迁。确需以尚未提交的内容开始工作时，由用户先明确准备合适的来源提交或独立目录。

## 创建、绑定与恢复

创建请求使用稳定 `requestId`。相同请求返回原目录和线程；相同标识携带不同模型、选项或 Worktree 参数会被拒绝。超时或连接中断后，应核对原请求。不得通过生成新标识来推定原操作没有执行。

| 状态 | 含义与恢复边界 |
|---|---|
| `creating` | 已保存创建意图，Git 结果尚未确认。重复请求不能创建第二份目录。 |
| `created` | Git checkout 已确认。线程绑定尚未完成，不表示可以开始模型执行。 |
| `binding` | 已选择实际执行宿主，线程创建或其回执仍待确认。恢复读取原 Core 回执，不重发未知提交。 |
| `ready` | 线程身份与实际宿主已确认。新会话可以使用该 Runtime 的工作区根。 |
| `failed` | 已确认失败。保留来源和已创建资源，修正问题后使用新的明确请求。 |
| `unknown` | 部分 Git 操作结果不确定。先查询并核对现有分支、目录和记录，不重放或强制清理。 |

创建结果仍不确定时，先点击“检查操作状态”核对原 UUID。检查后仍需返回编辑，可点击“保留原结果，返回草稿”并确认。此操作归档原请求信息、保留原目录和可能已创建的空会话，不重发请求、不发送草稿。随后可手动选择新的工作区，再以新请求发送；这会创建另一份资源，原结果仍须单独核查。

创建事件属于桌面宿主的持久日志。界面把事件投影到对话流，并在线程、工作区上下文中显示分支和目录；这些投影不伪造 Core 消息或模型工具结果。重连从原记录及宿主快照恢复。Git 成功而登记、资源初始化或绑定失败时，保留目录供核查，不回退来源目录继续执行。

已存在的目标分支、目录冲突、非法 ref、跨仓库来源和非 Git 来源的第二个根会话会被拒绝。根目录禁止路径穿越和符号链接祖先。并发创建通过独立请求记录和目标预留处理；`git worktree lock` 不是文件写互斥。产品不自动回收、删除或合并 Worktree。

## 执行隔离的范围

逻辑项目、来源 checkout 和实际执行宿主是不同身份。工具路径、shell 默认 cwd、受管进程、子 Agent 和队列归属于实际 Core 与 Runtime。桌面文件编辑、Git、媒体、历史、进程控制和浏览器回调也按线程所有者路由。原生文件打开使用同一线程目录，未保存文件缓存按逻辑项目和实际根区分。

自动分离仅适用于尚未执行的新根会话。已经读取或修改共享目录的线程不会在下一次写入时透明切换目录，否则旧读集和补丁计划可能失效。

已有共享线程和 Fork 使用桌面宿主的保守作者准入。作者身份按规范化的 Git checkout 根目录登记，因此 `/repo` 与 `/repo/src` 共用一个作者，真正的 linked worktree 则独立。不同执行根存在祖先或子目录重叠时保守拒绝，包括嵌套的独立 Git 仓库和非 Git 目录；旧嵌套作者记录也不自动迁移或覆盖。每个执行根持久保留一个根 Session 作者，同一 Session 的子 Agent 可以继续使用它。第二个独立 Session 在发送、继续、可执行队列控制、进程输入或其他受控写入动作派发前收到 `WORKTREE_REQUIRED`，并提示创建独立 Worktree 会话。它不会被自动迁移、复制 dirty 内容或回退执行。这个策略比仅在同时写入时加锁更保守，作者资格不会因 Turn 结束、空闲、GUI 断开或心跳超时而释放。

首次取得作者资格前，宿主查询 Core 的线程身份和执行状态，也核对指向同一 checkout 的其他登记宿主；这些宿主断开或状态未知时不能取得资格。其他 Session 的活动轮次、无法归属的进程、未知清理、待处理队列或 Task/Workgroup 执行会阻止取得资格。只读检查、明确的取消和资源清理仍可使用，普通 Side 讨论继续沿只读合同执行。每次作者准入还分页读取同 checkout 各宿主的完整任务目录，包括已经持有作者记录时。未取消的 scheduled 任务即使暂停、休眠或 `activeTasks` 为零也阻断普通 Session；只有核对过 token、Task 与锚点的原任务家庭可以保留其资格。目录读取未知、失败或分页异常均阻断，不自动暂停或删除任务。该准入覆盖桌面服务提交入口，不追溯停止已经运行的任务。

每次作者准入（包括已有作者记录和重启后）都会完整分页读取真实 Task 目录。未取消的休眠、暂停或已准备定时任务会阻止普通作者执行；专用任务只放行与原预约 token、Task ID 和锚点精确匹配的家庭。目录不可用、未知字段或异常分页也保守阻断，不自动修改任务状态。

定时任务操作先核对持久化的实际宿主归属，再使用经 Core 核对的线程锚点进入同一作者准入。任务归属不明、冲突、原宿主已移除或读取超时时，不回退逻辑项目的来源目录。`taskRunNow`、`taskResumeRun`、`taskReply` 和 `taskResume` 没有可核对的线程锚点时拒绝执行；调用者提供的线程不能覆盖已记录的任务归属。

定时任务使用专用准入：一个任务家庭只可占用为其自动分配的独立项目外目录，共用同一目录作者登记。只读规划会话的开始、发送和原自动保存确认流程继续可用；创建执行锚点和任务前先保留目录，再核对创建收据并绑定任务。`scheduled` 创建可使用可信已有锚点，或在预约完成后创建锚点。后续启动和恢复还核对 Task、run、线程锚点及实际 cwd。前台和后台任务继续通过可信锚点及普通作者准入。

当前 scheduled Run 的交互可以映射到原预约的任务家庭作者，但仅限严格核对的 `respond` 和 `continue` 请求：预约、唯一活动 Run、goal、当前 Turn、实际 cwd，以及 Core 已登记 worker 和有界父链都须一致。问题或审批响应还须匹配未过期的 pending interaction、线程、Turn、requestId 和回答种类。它不授权任意后代、其他 Session、普通 send、编辑或 manage 写操作；native Task Agent 的研究和工具限制继续生效，不能递归委派。

回答有效问题或审批后，Core 自动继续原 Run。Core 的普通 Continue 仍不支持 goal 所有的定时执行线程；暂停或 blocked Run 使用 `taskResumeRun`，在同一 Run 和线程创建新 Turn。交互等待时 Host 断开会暂停 Run，旧 requestId 不可重放；恢复后只回答新 Turn 的新问题。取消、暂停、已结束或不属于当前 Run 的身份不能用于交互作者映射。

共享目录、用户选择的已有目录及没有原预约的旧定时任务不能启用或恢复执行，返回 `SCHEDULE_WORKSPACE_REQUIRED` 或对应的作者准入错误；暂停和取消仍可进行。符合专用目录预约的 `taskDraftConfirm` 创建、更新和恢复可继续使用。

直接 Core 或 CLI 调用、不同桌面数据目录中的宿主，以及绕过桌面入口的原生调度不受这份作者登记统一控制。准入不会追溯停止已准备或已运行的旧自主任务，不能据此承诺这些路径已获得同样隔离。

作者登记在桌面数据目录的 `workspace-authors` 中。`claim.lock` 串行化新作者登记；正常操作结束后释放，崩溃留下的锁不会因超时自动删除。人工恢复前，必须确认原桌面宿主、Core、Runtime、子 Agent 及后台进程全部停止，备份完整桌面数据目录，并核对作者、任务和创建收据。只有确认锁确为陈旧且不存在旧执行后才可人工移走该锁；保留作者记录，不通过删除记录转让目录。无法确认时继续阻断。

独立 Runtime 根不等于文件系统安全沙箱。`full-access` shell 可以使用绝对路径访问其他 checkout；可信 MCP、插件 Host 和外部程序也可能产生根目录之外或延迟发生的副作用。Git Worktree 仍共享对象、refs 和部分仓库配置。OS 权限、外部服务授权和上游的作者租约、读集版本及进程清理保护继续生效，不能据此承诺所有入口绝无并发写。

## 与 Codex 的取舍

[Codex App Worktree 文档](https://learn.chatgpt.com/docs/environments/git-worktrees)描述选定起始分支、默认 detached HEAD、可应用来源分支未提交改动和可配置 Worktree root。AReaL 的命名分支、默认 `areal` 前缀和只使用已提交内容是本产品的明确选择，不是 Codex 的默认合同。

[固定版本的公开模型工具合同](https://github.com/openai/codex/blob/e6ebdfe00b520e21ed50ac0362656f32dd64d2fc/codex-rs/tui/src/managed_worktree_tool_specs.rs)包含 `create_worktree`、`get_worktree_creation_status` 和 `list_worktrees`。该 TUI 合同默认使用 remote default branch，不复制未提交改动，通过 operationId 查询，且不改变调用线程 cwd。它与 App 新会话入口的语义不同。

AReaL 复用统一宿主管理能力，不新增要求模型自愿调用的创建工具。写前隔离属于宿主准入策略，不能由模型工具替代。新根会话采用独立 Core 与 Runtime，避免仅修改 `Thread.cwd` 却仍使用旧执行根。代价是更多服务实例、持久路由及聚合状态。图标沿用现有设计系统中的分支和 Worktree 含义，不宣称复刻 Codex 私有实现。

## 复验入口

从仓库根运行 Git、宿主和桌面契约测试：

```sh
node --test clients/gui/scripts/worktree-git.test.cjs clients/gui/scripts/worktree-host.test.cjs clients/gui/scripts/worktree-contract.test.cjs clients/gui/scripts/worktree-admission.test.cjs clients/gui/scripts/worktree-task-routing.test.cjs clients/gui/scripts/schedule-admission.test.cjs
```

生产组件交互由 `node clients/gui/scripts/worktree-ui-smoke.mjs` 验证。它使用 Chromium 和确定性桌面动作 fixture，不代表原生 Electron、安装包或 macOS 验收。

构建真实 Core 后，在支持原生执行边界的环境运行：

```sh
make build
AREAL_CORE_BIN="$PWD/target/debug/areal" node clients/gui/scripts/worktree-integration.mjs
```

真实 Core 的定时任务交互协议可另行复验：

```sh
AREAL_CORE_BIN="$PWD/target/debug/areal" node clients/gui/scripts/worktree-schedule-interactions.mjs
```

也可从 `clients/gui` 运行 `node scripts/worktree-schedule-interactions.mjs`，默认使用仓库构建的 Core。该脚本使用确定性本地模型边界和真实 CoreBackend/Core，覆盖问题回答、错误身份与旧请求拒绝、审批拒绝、allowOnce、管理器重连及同 Run 恢复。它保存原始日志和 manifest，分别报告协议结果与 payload 结果。协议通过不等于文件工具成功：allowOnce 获准后仍可能在 Runtime reaper 启动处失败，目标文件未写入。它不运行 Electron，也不代表 macOS 或真实 provider 验收。

Linux 需要可用的 Bubblewrap namespaces 和 Runtime reaper 可读取的 `/proc/self/task/<pid>/children`。能力不足或清理证据缺失时保留失败，不关闭保护。GUI 业务结果、跨平台行为和实际工具写入分别验证。完整宿主字段见[桌面宿主契约](../api/desktop.md#桌面宿主-worktree-契约)。
