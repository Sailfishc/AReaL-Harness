**中文** | [English](ios-development.en.md)

# 验证 iOS 移动壳

移动壳使用 Capacitor 8.5.3 和 Swift Package Manager。`clients/mobile/ios/` 是受控 Xcode 工程，原生部署目标为 iOS 17.4。iOS 17.5 已通过真实 WKWebView 门禁，iOS 17.4 尚需在相应运行时复验。项目当前提供诊断空壳，业务页面、设备密钥持久化和发行渠道尚未实现。iOS 17.0 的真实 WKWebView 门禁因生产依赖缺少 `Promise.withResolvers` 而在 Noise 阶段失败。最低版本采用已提供该标准 API 的 iOS 17.4。

## 准备环境

安装 Xcode 26 或更高版本、iOS Simulator，以及符合 `clients/gui/package.json` 的 Node 和 pnpm。Capacitor 的要求见[官方环境说明](https://capacitorjs.com/docs/getting-started/environment-setup)。本机只有较新运行时不表示最低系统版本已验收。

从仓库根运行依赖安装。移动包属于 GUI workspace，依赖统一写入 `clients/gui/pnpm-lock.yaml`。

```sh
pnpm --dir clients/gui install --frozen-lockfile
pnpm --dir clients/gui mobile:sync
pnpm --dir clients/gui --filter @areal/mobile open
```

`mobile:sync` 先构建 `clients/gui/renderer/mobile/index.html`，再运行 `cap sync ios`。官方生成的 SPM 库平台声明为 iOS 17，App 的部署下限为 iOS 17.4。库的较低下限不扩大 App 的可安装系统范围。构建产物只进入 `clients/gui/dist/mobile/`，Capacitor 的 `webDir` 指向这个目录。普通桌面和 Web Remote 构建不参与移动壳入口。修改 Web 源码后重新运行同步命令，再从 Xcode 或 `pnpm --dir clients/gui --filter @areal/mobile exec cap run ios` 启动。顺序遵循[官方开发工作流](https://capacitorjs.com/docs/basics/workflow)。

默认 Bundle ID 是开发占位值 `com.example.arealharness`。门禁脚本支持 `AREAL_MOBILE_BUNDLE_ID`，并把值作为 Xcode 的 `PRODUCT_BUNDLE_IDENTIFIER` 传入。准备设备签名时，在 Xcode 工程和 Capacitor 配置中选定自己拥有的 Bundle ID，再配置开发团队。

## 运行 WKWebView 握手门禁

先通过 `xcrun simctl list runtimes` 查看安装的运行时。默认使用 iOS 17.5，可以指定其他已安装版本。

```sh
pnpm --dir clients/gui test:mobile-handshake
AREAL_IOS_RUNTIME=17.4 pnpm --dir clients/gui test:mobile-handshake
```

脚本创建自己的 iPhone 模拟器，信任一次性夹具 CA，构建并安装 Debug App。App 在真实 `capacitor://localhost` WKWebView 中导入生产 `channel.mjs` 和 `wire.mjs`，经过严格 WSS、Relay、Noise Host pin、现有 `hello`、夹具 Observer 批准、内层 `ready` 和 `project.list`。它还运行错误 Host pin、错误证书名称和未信任 CA 的拒绝检查。脚本结束时停止夹具，并删除自己创建的模拟器。

结果默认保存在 `.scratch/ios-remote-v1/mobile-gate/`。每个系统版本有 JSON、构建日志和截图。`AREAL_MOBILE_EVIDENCE` 可以指定另一个证据目录。`AREAL_MOBILE_CASES=handshake` 可以只运行正向路径。缺失随机数、`crypto.subtle`、`AbortSignal.timeout` 或 `Promise.withResolvers` 会使兼容性门禁失败。握手仍尝试原有实现，以区分实际协议失败和运行时能力缺口。脚本不注入加密替代或兼容性 polyfill。

Debug 原生桥只在收到启动环境变量 `AREAL_MOBILE_PROBE` 时注入临时配对参数。参数和设备私钥只存在进程内存。桥向 App 容器写入公开 Peer ID 和脱敏结果，runner 读取后完成夹具批准。Release 编译不包含这个桥。夹具批准不代替桌面人工配对验收。

这个门禁只证明所运行系统上的移动壳与当前协议链路。它不证明真实供应商、Rust Core 执行、设备密钥存储、后台恢复、真机安装或 TestFlight 可用。

## 选择后续验证工具

先使用原生 `xcodebuild`、`simctl` 和结构化结果重跑门禁。需要 Agent 统一构建、启动和日志工具时，可评估社区 [MobileBuildMCP](https://github.com/getsentry/MobileBuildMCP)。本工程不依赖它。

业务页面形成后，采用 [Appium XCUITest 的 hybrid contexts](https://appium.github.io/appium-xcuitest-driver/latest/guides/hybrid/) 验证原生壳与 Web DOM 的切换。Debug 壳开启 `WKWebView.isInspectable`。评估 Maestro 时，先确认其[已知问题](https://docs.maestro.dev/extra-materials/troubleshooting/known-issues)中的 WebView 可访问性限制。

需要内部发行时，再按 [fastlane pilot](https://docs.fastlane.tools/actions/pilot/) 准备 TestFlight 上传。发行凭据和签名不属于本地握手门禁。
