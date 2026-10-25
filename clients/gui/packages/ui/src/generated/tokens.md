<!-- Generated from tokens.json and src/theme.ts. Run pnpm --dir clients/gui --filter @areal/ui generate. -->
# @areal/ui Token 速查

写样式时按用途选这里的变量，不写字面量。数值只在 [tokens.json](../../tokens.json) 修改；调色板派生在 [theme.ts](../theme.ts)。

## 字号

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `--ui-font-size` | `14px` | 界面默认字号；用户偏好可覆盖 |
| `--ui-font-weight` | `400` | 界面常规字重 |
| `--text-conversation` | `var(--content-font-size, 14px)` | 对话时间线字号：正文、活动行、子代理行与过程状态共用，跟随内容字号偏好 |
| `--text-ui-xl` | `calc(var(--ui-font-size) + 4px)` | 区块标题 |
| `--text-page-title` | `calc(var(--ui-font-size) + 8px)` | 页面标题、空态大标题 |
| `--text-ui-lg` | `calc(var(--ui-font-size) + 2px)` | 输入框文字、卡片标题等较突出内容 |
| `--text-ui-base` | `var(--ui-font-size)` | 界面正文、卡片内容、普通反馈；在消息正文内被重映射为内容字号 |
| `--text-ui-caption` | `calc(var(--ui-font-size) - 1px)` | 按钮、菜单与紧凑标签 |
| `--text-content-caption` | `max(12px, calc(var(--content-font-size, 14px) - 1px))` | 执行摘要、状态等过程附注，跟随内容字号而非界面字号 |
| `--text-content-h1` | `calc(var(--content-font-size, 14px) + 10px)` | 阅读内容一级标题（文件阅读器、长文档），跟随内容字号；14px 时 24px |
| `--text-content-h2` | `calc(var(--content-font-size, 14px) + 6px)` | 阅读内容二级标题，跟随内容字号；14px 时 20px |
| `--text-content-h3` | `calc(var(--content-font-size, 14px) + 4px)` | 阅读内容三级标题，跟随内容字号；14px 时 18px |
| `--text-content-h4` | `calc(var(--content-font-size, 14px) + 2px)` | 阅读内容四级标题，跟随内容字号；14px 时 16px |
| `--text-ui-sm` | `calc(var(--ui-font-size) - 2px)` | 说明文字、次要反馈、表格辅助列 |
| `--text-ui-xs` | `max(11px, calc(var(--ui-font-size) - 3px))` | 来源细节、元信息；最小 11px，不用于正文 |
| `--text-ui-2xs` | `calc(var(--ui-font-size) - 5px)` | 仅限工作流图轴面的例外刻度 |
| `--text-mobile-input-safe` | `16px` | 移动端聚焦输入的安全字号下限 |

## 行高与字重

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `--line-height-ui` | `max(20px, calc(var(--ui-font-size) + 6px))` | 界面正文行高，随界面字号增长 |
| `--line-height-ui-sm` | `max(18px, calc(var(--ui-font-size) + 4px))` | 紧凑说明行高 |
| `--tracking-wf-label` | `0.09em` | 工作流图大写等宽微标签字距 |

## 间距与尺寸

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `--reading-width` | `768px` | 消息与Composer共用的阅读宽度上限 |
| `--spacing-control-xs` | `max(20px, calc(var(--ui-font-size) + 6px))` | 超紧凑控件高度（h-control-xs），随界面字号增长 |
| `--spacing-control-sm` | `max(24px, calc(var(--ui-font-size) + 10px))` | 紧凑控件高度（h-control-sm），设置行内按钮与选择器 |
| `--spacing-control` | `max(28px, calc(var(--ui-font-size) + 14px))` | 默认控件高度（h-control / size-control），按钮、图标按钮 |
| `--spacing-control-lg` | `max(32px, calc(var(--ui-font-size) + 18px))` | 较大控件高度（h-control-lg） |
| `--spacing-control-form` | `max(38px, calc(var(--ui-font-size) + 24px))` | 表单输入框高度 |
| `--spacing-inline` | `8px` | 同行相邻内容的间距 |
| `--spacing-field` | `16px` | 内容块与内侧留白 |
| `--spacing-section` | `24px` | 分区间距 |
| `--spacing-panel` | `16px` | 面板内留白 |

## 圆角

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `--radius-control` | `10px` | 输入框、选择器、设置卡片等控件外框 |
| `--radius-button` | `8px` | 文字按钮与按钮式入口 |
| `--radius-inset` | `8px` | 容器内部的内嵌块：列表项、引用、图片视口 |
| `--radius-pill` | `999px` | 胶囊形：发送等主动作、标签、计数徽标 |
| `--radius-overlay` | `20px` | 大浮层与独立工作区：Worktree 设置、目录列表、定时任务 |
| `--radius-navigation` | `12.5px` | 导航项、侧栏行与拖拽预览 |
| `--radius-composer` | `18px` | 输入区外框 |
| `--radius-panel` | `12px` | 面板与分组卡片 |
| `--radius-dialog` | `16px` | 对话框 |
| `--radius-message` | `16px` | 用户消息气泡圆角 |

## 阴影

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `--shadow-menu` | `0 0 0 0.5px var(--color-menu-border, var(--color-border)), 0 8px 16px -4px rgb(0 0 0 / 12%)` | 下拉菜单与右键菜单 |
| `--shadow-overlay` | `0 4px 12px rgb(0 0 0 / 10%), 0 14px 40px rgb(0 0 0 / 8%)` | Popover 与悬浮面板 |
| `--shadow-composer` | `var(--composer-shadow-light)` | 输入区外框阴影，暗色由调色板切换 |
| `--shadow-dialog` | `0 12px 32px rgb(0 0 0 / 20%)` | 对话框 |

## 状态色与语义色

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `--color-button-surface` | `color-mix(in srgb, var(--color-foreground) 10%, var(--color-card))` | secondary 按钮的底色 |
| `--color-button-hover` | `color-mix(in srgb, var(--color-foreground) 14%, var(--color-card))` | secondary 按钮的悬停底色 |
| `--color-destructive` | `#e03131（暗色 #ff5c5c）` | 危险操作与错误；AReaL 明暗主题值 |
| `--color-destructive-foreground` | `var(--color-foreground-inverse)` | 危险底色上的文字 |
| `--color-warning` | `#e07b00（暗色 #ff8a30）` | 警告反馈；AReaL 明暗主题值 |
| `--color-warning-foreground` | `var(--color-foreground-inverse)` | 警告底色上的文字 |
| `--color-foreground-inverse` | `#ffffff（暗色 #000000）` | 强调底色上的反色文字；明暗主题各自取值 |
| `--color-ring` | `var(--color-input-border-focused)` | 键盘焦点环颜色，跟随强调色 |
| `--color-muted` | `var(--color-surface)` | 弱化区域底色 |
| `--color-muted-foreground` | `var(--color-foreground-subtle)` | 弱化区域文字 |
| `--color-success` | `#1e8a3e（暗色 #46bf72）` | 成功反馈；AReaL 明暗主题值 |

## 动效与层级

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `--motion-fast` | `100ms` | 悬停、按下等即时反馈的过渡时长；减少动效时为 0 |
| `--motion-normal` | `160ms` | 展开、切换、浮层出现等常规过渡时长；减少动效时为 0 |
| `--motion-slow` | `240ms` | 面板、大区域位移等较长过渡时长；减少动效时为 0 |
| `--ease-standard` | `cubic-bezier(.2, 0, 0, 1)` | 所有过渡的默认缓动曲线 |
| `--layer-dialog` | `50` | 对话框层级 |
| `--layer-popover` | `60` | 菜单、Popover 层级，高于对话框 |
| `--layer-tooltip` | `70` | Tooltip 层级，最高 |

## 其他

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `--border-width-default` | `1px` | 描边、分隔线的默认宽度 |
| `--font-sans` | `-apple-system, system-ui, "Segoe UI", "PingFang SC", "Microsoft YaHei UI", "Noto Sans CJK SC", sans-serif` | 基础界面字体及平台回退 |
| `--font-mono` | `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", monospace` | 代码字体及CJK无衬线回退 |
| `--conversation-line` | `1.43` | 对话时间线行高（无单位比例）：14px 时为 20px；标题与更大的内容字号按比例增长 |
| `--conversation-gap` | `12px` | 对话时间线块间距：段落、活动行、子代理行、状态行之间的统一节奏 |

## 已有派生参数与来源

角色登记保留现有运行时算法。未将未证实的截图来源或复杂分支改写为通用表达式语言。

| 参数 | 记录 |
| --- | --- |
| `contrastBase` | {"light":45,"dark":60,"source":"themes.contrast，原有主题默认值"} |
| `darkReferenceRange` | {"value":231,"source":"theme.ts 已有分母 231，来源未记录，保持原精度。"} |
| `raisedReferenceMix` | {"value":"2100 / 231","source":"theme.ts 原注释的紧凑查看器与历史过程抬升层，截图编号未记录"} |
| `shellReferenceMix` | {"value":"1200 / 231","source":"theme.ts 原注释的已接受 #242424 深色外壳层，截图编号未记录。"} |
| `navigationReferenceMix` | {"value":"600 / 231","source":"theme.ts 原注释的 #1e1e1e 导航层，截图编号未记录"} |
| `settingsCardReferenceMix` | {"value":"1100 / 231","source":"theme.ts 原注释的 #232323 设置组层"} |
| `secondaryTextMix` | {"value":69.5,"contrastSlope":0.15,"source":"design-system/exercises/settings-contrast.md 与 design-system-settings-exercise.mjs 已有独立验证"} |
| `settingsDarkTextOpacity` | {"value":65,"contrastSlope":0.15,"source":"design-system/exercises/settings-contrast.md 的已接受 65% 暗色设置说明层"} |
| `defaultOverrides` | {"background":{"light":"#ffffff","dark":"#181818"},"foreground":{"dark":"#ffffff"},"accent":"#3a83f7","source":"themes 与 theme.ts 已有默认主题分支，保持自定义输入分支"} |

## 调色板（由主题输入派生，用户可在外观设置中覆盖）

| 变量 | 层与角色 | 引用与来源 | 默认亮色 | 默认暗色 |
| --- | --- | --- | --- | --- |
| `--color-background` | semantic · 阅读表面 | src/theme.ts#paletteVariables | `#ffffff` | `#181818` |
| `--color-foreground` | semantic · 默认正文 | src/theme.ts#paletteVariables | `#1a1c1f` | `#ffffff` |
| `--color-brand` | semantic · 用户强调色 | src/theme.ts#paletteVariables | `#3a83f7` | `#3a83f7` |
| `--color-file-reference` | semantic · 文件引用文字 | src/theme.ts#paletteVariables | `#2c67c5` | `color-mix(in srgb, #2c67c5 80%, #ffffff)` |
| `--color-process-settled` | component · 已结算过程元信息 | src/theme.ts#paletteVariables | `color-mix(in srgb, #1a1c1f 69.5%, #ffffff)` | `color-mix(in srgb, #ffffff 50%, transparent)` |
| `--color-result-card` | component · 已完成文件结果表面 | src/theme.ts#paletteVariables | `color-mix(in srgb, #1a1c1f 3%, transparent)` | `color-mix(in srgb, color-mix(in srgb, #ffffff 9.090909090909092%, #181818) 50%, transparent)` |
| `--shadow-result-card` | component · 文件结果半像素描边 | src/theme.ts#paletteVariables | `0 0 0 .5px color-mix(in srgb, #1a1c1f 8%, transparent)` | `0 0 0 .5px color-mix(in srgb, #ffffff 15.6%, transparent)` |
| `--color-result-icon` | component · 已完成文件结果图标底色 | src/theme.ts#paletteVariables | `#ffffff` | `color-mix(in srgb, #181818 83.333333%, #000000)` |
| `--color-history-comment` | component · 历史过程表面 | src/theme.ts#paletteVariables | `#ffffff` | `color-mix(in srgb, #ffffff 9.090909090909092%, #181818)` |
| `--color-viewer-control` | component · 紧凑查看器控件表面 | src/theme.ts#paletteVariables | `color-mix(in srgb, #1a1c1f 3%, transparent)` | `color-mix(in srgb, #ffffff 9.090909090909092%, #181818)` |
| `--color-history-comment-hover` | component · 历史过程悬停表面 | src/theme.ts#paletteVariables | `#ffffff` | `color-mix(in srgb, color-mix(in srgb, #ffffff 12.987012987012987%, #181818) 96%, transparent)` |
| `--color-primary` | semantic · 主动作底色 | src/theme.ts#paletteVariables | `#1a1c1f` | `#ffffff` |
| `--color-primary-foreground` | semantic · 主动作文字 | src/theme.ts#paletteVariables | `#ffffff` | `#2d2d2d` |
| `--color-composer-action` | component · 输入区主动作 | --color-primary | `var(--color-primary)` | `var(--color-primary)` |
| `--color-composer-action-foreground` | component · 输入区主动作文字 | --color-primary-foreground | `var(--color-primary-foreground)` | `var(--color-primary-foreground)` |
| `--color-accent` | semantic · accent | src/theme.ts#paletteVariables | `color-mix(in srgb, #1a1c1f 6%, #ffffff)` | `color-mix(in srgb, #ffffff 6%, #181818)` |
| `--color-secondary` | semantic · secondary | src/theme.ts#paletteVariables | `color-mix(in srgb, #1a1c1f 5%, transparent)` | `color-mix(in srgb, #ffffff 5%, transparent)` |
| `--color-user-message` | component · 用户消息气泡 | src/theme.ts#paletteVariables | `#e8f3fe` | `#173e76` |
| `--color-user-message-text` | component · 用户消息文字 | src/theme.ts#paletteVariables | `#0c274a` | `#f6fafe` |
| `--color-background-win-alt` | semantic · background win alt | src/theme.ts#paletteVariables | `color-mix(in srgb, #1a1c1f 4%, #ffffff)` | `color-mix(in srgb, #ffffff 4%, #181818)` |
| `--color-shell` | semantic · 标题栏与边栏外壳 | src/theme.ts#paletteVariables | `color-mix(in srgb, #1a1c1f 4%, #ffffff)` | `color-mix(in srgb, #ffffff 5.194805194805195%, #181818)` |
| `--color-navigation-background` | semantic · 导航表面 | src/theme.ts#paletteVariables | `color-mix(in oklab, #ffffff 70%, transparent)` | `color-mix(in srgb, #ffffff 2.5974025974025974%, #181818)` |
| `--color-navigation-selected` | semantic · 导航选中层 | src/theme.ts#paletteVariables | `color-mix(in srgb, #1a1c1f 5.5%, transparent)` | `color-mix(in srgb, #ffffff 10.38961038961039%, #181818)` |
| `--shadow-page-surface` | component · 页面表面阴影 | src/theme.ts#paletteVariables | `0 0 0 .5px color-mix(in srgb, #1a1c1f 8%, transparent), 0 4px 16px #0000000d` | `0 0 0 .5px color-mix(in srgb, #ffffff 6%, transparent), 0 4px 16px #0000000d` |
| `--color-sidebar` | component · 设置侧栏材料 | src/theme.ts#paletteVariables | `color-mix(in srgb, #ffffff 70%, transparent)` | `rgb(40 40 40 / 0.7)` |
| `--color-sidebar-item` | component · 设置侧栏行悬停层 | src/theme.ts#paletteVariables | `color-mix(in srgb, #1a1c1f 5.5%, transparent)` | `rgba(255, 255, 255, 0.08)` |
| `--color-composer` | component · 输入区材料 | src/theme.ts#paletteVariables | `color-mix(in srgb, #ffffff 86.4706%, transparent)` | `color-mix(in srgb, color-mix(in srgb, #ffffff 12.987012987012987%, #181818) 96%, transparent)` |
| `--shadow-composer` | component · 输入区阴影 | src/theme.ts#paletteVariables | `var(--composer-shadow-light)` | `var(--composer-shadow-dark)` |
| `--color-background-alt` | semantic · background alt | src/theme.ts#paletteVariables | `color-mix(in srgb, #1a1c1f 3%, #ffffff)` | `color-mix(in srgb, #ffffff 3%, #181818)` |
| `--color-card` | semantic · card | src/theme.ts#paletteVariables | `#ffffff` | `#181818` |
| `--color-settings-card` | component · 设置组表面 | src/theme.ts#paletteVariables | `#ffffff` | `color-mix(in srgb, #ffffff 4.761904761904762%, #181818)` |
| `--color-header` | semantic · header | src/theme.ts#paletteVariables | `#ffffff` | `#181818` |
| `--color-panel` | semantic · panel | src/theme.ts#paletteVariables | `#ffffff` | `#181818` |
| `--color-popover` | semantic · popover | src/theme.ts#paletteVariables | `#ffffff` | `#181818` |
| `--color-menu` | component · 菜单材料 | src/theme.ts#paletteVariables | `color-mix(in srgb, #ffffff 90%, transparent)` | `color-mix(in srgb, color-mix(in srgb, #ffffff 9.090909090909092%, #181818) 90%, transparent)` |
| `--color-menu-border` | component · 菜单描边 | src/theme.ts#paletteVariables | `color-mix(in srgb, #1a1c1f 8%, transparent)` | `color-mix(in srgb, #ffffff 8.2%, transparent)` |
| `--color-menu-hover` | component · 菜单悬停层 | src/theme.ts#paletteVariables | `color-mix(in srgb, #1a1c1f 5.5%, transparent)` | `color-mix(in srgb, #ffffff 5.5%, transparent)` |
| `--color-composer-catalog` | component · 输入区目录表面 | src/theme.ts#paletteVariables | `#ffffff` | `color-mix(in srgb, #ffffff 8.658008658008658%, #181818)` |
| `--color-input` | semantic · input | src/theme.ts#paletteVariables | `#ffffff` | `#181818` |
| `--color-input-focused` | semantic · input focused | src/theme.ts#paletteVariables | `#ffffff` | `#181818` |
| `--color-input-border` | semantic · input border | --color-border | `var(--color-border)` | `var(--color-border)` |
| `--color-input-border-hover` | semantic · input border hover | --color-border-hover | `var(--color-border-hover)` | `var(--color-border-hover)` |
| `--color-foreground-subtle` | semantic · 次要文字 | src/theme.ts#paletteVariables | `color-mix(in srgb, #1a1c1f 69.5%, #ffffff)` | `color-mix(in srgb, #ffffff 69.5%, #181818)` |
| `--color-foreground-subtlest` | semantic · 最弱元信息文字，不保证正文对比度 | src/theme.ts#paletteVariables | `color-mix(in srgb, #1a1c1f 49.5%, #ffffff)` | `color-mix(in srgb, #ffffff 49.5%, #181818)` |
| `--color-settings-secondary` | component · 设置说明文字 | src/theme.ts#paletteVariables | `color-mix(in srgb, #1a1c1f 69.5%, #ffffff)` | `color-mix(in srgb, #ffffff 65%, transparent)` |
| `--color-border` | semantic · border | src/theme.ts#paletteVariables | `color-mix(in srgb, #1a1c1f 7.8%, transparent)` | `color-mix(in srgb, #ffffff 8.4%, transparent)` |
| `--color-border-hover` | semantic · border hover | src/theme.ts#paletteVariables | `color-mix(in srgb, #1a1c1f 11.7%, transparent)` | `color-mix(in srgb, #ffffff 11.7%, transparent)` |
| `--color-hover` | semantic · hover | src/theme.ts#paletteVariables | `color-mix(in srgb, #1a1c1f 5.5%, transparent)` | `color-mix(in srgb, #ffffff 5.5%, transparent)` |
| `--color-selected` | semantic · selected | src/theme.ts#paletteVariables | `color-mix(in srgb, #1a1c1f 5.5%, transparent)` | `color-mix(in srgb, #ffffff 5.5%, transparent)` |
| `--color-surface` | semantic · surface | src/theme.ts#paletteVariables | `color-mix(in srgb, #1a1c1f 3%, transparent)` | `color-mix(in srgb, #ffffff 3%, transparent)` |
| `--color-surface-hover` | semantic · surface hover | src/theme.ts#paletteVariables | `color-mix(in srgb, #1a1c1f 5.5%, transparent)` | `color-mix(in srgb, #ffffff 5.5%, transparent)` |
| `--color-input-border-focused` | semantic · 输入与焦点强调 | src/theme.ts#paletteVariables | `#3a83f7` | `#3a83f7` |
