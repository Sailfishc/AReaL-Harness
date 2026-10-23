# 浏览器自动化

此包将 ZCode `3c5b227649371507ddc4eb46ac5133afe6db1cab` 的已实现 IAB 命令接入 AReaL 的 Core 审批和现有 Preview。来源为 [zai-org/ZCode](https://github.com/zai-org/ZCode)。[English](README.en.md)。

`src/upstream/browser` 保留执行器及其完整 16 文件依赖闭包、WebM 录制器和透明窗口截图初始化算法。`src/upstream/schema` 保留严格运行时 schema。`recordingScenario.ts` 提取上游 BrowserGuestManager 的录制动作算法。原始文件 SHA-256、源路径和适配说明见 `UPSTREAM.json`。Apache-2.0 许可见 `LICENSE-ZCODE`，第三方说明见 `NOTICE`。

## 接口

Core 工具使用 `{operation:"command",parameters:{pageId,command}}`。例如定位器点击命令为 `{method:"playwright",action:{name:"locator",selector:"#continue",operation:"click"}}`。`describeBrowserCommands()` 返回完整 JSON schema、实际方法清单、限制和有效示例。`validateBrowserCommand()` 使用上游 schema 解析，并限制普通等待最多 30 秒、下载等待最多 120 秒。

默认 CommonJS 入口不依赖 Electron，导出 schema、描述、`executeBrowserCommandOnView` 和录制动作编排。`@areal/browser-automation/electron` 导出实际 Electron WebM 录制器和后台截图租约。Playwright `1.59.1` 与 Zod `4.6.5` 是运行时依赖。执行器从 Playwright 包读取注入脚本，不能在打包时遗漏它。

Preview 保持唯一 Page、WebContentsView、debugger、控制 epoch 和输入账本。每条命令消费绑定原始参数的不可变一次性审批计划。定位器、坐标、脚本、下载和录制动作都经过该边界。后台页面临时借用一个透明、不可聚焦窗口建立真实 compositor surface，完成后交还同一个 WebContentsView。录制保留完整已审批动作程序，取消、关闭和人工接管撤销后续输入。

## 已实现命令组

- 页面导航、状态、语义快照、页面与元素求值。
- Playwright 定位器查询、可操作性检查、点击、双击、填入、按键、选择项、勾选、等待及跨域 iframe。
- CUA 坐标点击、拖动、按键、滚动和虚拟剪贴板。
- 视口、整页、裁剪和元素 PNG；可见性及视口设置。
- JavaScript alert/confirm 状态和处理；实际下载事件与完成路径。
- WebM 录制开始、状态、取消、完整动作 DSL 与工作区相对路径发布。
- 标签创建、选择、认领、列表、交接、交付、结束及关闭。

## 限制

上游的普通 `fill`、`waitFor` 声明没有执行器实现，应使用 Playwright locator 对应操作。上传、file chooser、`networkidle`、locator `downloadMedia` 返回明确不支持。Electron 44.5 WebContentsView 的 `prompt()` 实测抛出 `prompt() is not supported`，保留的 schema 字段不证明其可用。

本包不提供 CLI 无头、扩展或外部 CDP 后端，也不提供共享持久化浏览器配置、Chrome 凭据导入或 ZCode JavaScript SDK。现有每工作区临时 Session 和敏感页面保护继续由 Preview 管理。

## 验证

从 GUI 根运行 `node packages/browser-automation/scripts/build.mjs`。包内 `npm run check` 检查 TypeScript。`npm run acceptance` 启动使用临时 profile 和本地 HTTP fixture 的真实 Electron 验收。`acceptance/SCENARIOS.md` 记录实现前失败场景，`capture-prototype.cjs` 可重复验证隐藏页面 compositor 行为。包内验收不证明 Core 模型调用、安装包、真实供应商或操作系统物理输入通过。
