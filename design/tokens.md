# Token 语义与平台映射

共享设计需要统一角色及含义，再决定哪些默认值真正共享。当前 GUI、TUI 和本地 Web 各有数值与偏好所有者。本轮不新增一份复制这些值的 JSON。

## 三类信息分开维护

| 信息 | 所有者 | 维护方式 |
| --- | --- | --- |
| 语义角色及使用理由 | 本文件及共享原则 | 描述主内容、次内容、状态、焦点和密度的用途 |
| 跨端共享默认值 | 后续经消费者核对后选择的共享数据源 | 当前尚未建立；迁移时只有一处可编辑源，各端产物派生 |
| 平台映射与动态偏好 | 当前各客户端代码 | CSS 变量、终端颜色、字号偏好及系统能力各自适配 |

## 当前映射地图

下表列出已有来源，角色之间只是候选对应关系，不声明数值或完整行为相同。

| 角色 | GUI | TUI | 本地 Web |
| --- | --- | --- | --- |
| 主要与次要内容 | `--color-foreground` 等语义变量 | `Role::Text`、`Role::Muted` | `--text`、`--muted` |
| 成功、警告、错误 | 既有反馈组件与主题角色 | `Role::Success`、`Role::Warning`、`Role::Error` | `--success`、`--warning`、`--error` |
| 选择与强调 | 按钮及选中状态角色 | `Role::Accent` 与 `selected()` | `--accent` 与各控件状态 |
| 空间与密度 | 控件、文字、间距和形状角色 | 终端字符单元及 Ratatui 布局 | 本端 CSS 与响应式布局 |
| 焦点与动态反馈 | 公共控件、focus 与 reduced motion | 键盘焦点与文字状态 | 浏览器控件与 CSS |

GUI 的数值源是 [styles.css](../clients/gui/renderer/src/styles.css)、[applicationSettings](../clients/gui/renderer/src/settings/applicationSettings.ts)及相关偏好链。UI 字号还有 [App](../clients/gui/renderer/src/App.tsx) 的独立来源。具体控件选择见 [GUI Token 指南](../clients/gui/DESIGN_SYSTEM.md#token-选择)。

TUI 的 [theme.rs](../clients/tui/src/theme.rs)拥有角色与颜色转换，支持无色、终端色、真彩色及能力相关映射。本地 Web 由 [style.css](../clients/web/style.css)和 [app.js](../clients/web/app.js)拥有样式与主题偏好。Remote Web 的 [RemoteWorkbench](../clients/gui/renderer/src/remote/RemoteWorkbench.tsx)是另一消费路径，不能用本地 Web 的接线代替它。

非交互 CLI 可以共享状态含义和文案层级，但其 JSON、stream-json、退出码与 stdout 内容仍归 [CLI 契约](../docs/api/claude-cli.md)。不用 CSS 或终端颜色角色改写机器协议。

## 何时引入共享数值源

当两个实际消费者确认某组默认值应共同演进时，再选定源格式和平台输出。DTCG 是候选格式，不是前置要求。先迁移一个稳定角色组，生成受控输出并检查漂移，验证平台能力与用户覆盖后删除旧的可编辑定义。不能同时保留手写 JSON、CSS 和 Rust 三份同义数值源。

动态偏好和终端能力是运行输入，不是另一个默认值来源。共享默认值的加入不自动引入跨设备偏好同步。仅为图形平台成立的圆角或动效无需伪造终端等价物。
