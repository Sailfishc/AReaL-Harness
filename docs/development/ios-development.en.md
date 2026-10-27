[中文](ios-development.md) | **English**

# Verify the iOS mobile shell

The mobile shell uses Capacitor 8.5.3 and Swift Package Manager. `clients/mobile/ios/` is the tracked Xcode project, with an iOS 17.4 deployment target. iOS 17.5 passes the real WKWebView gate. iOS 17.4 still requires verification on that runtime. The project currently provides a diagnostic shell. Product screens, persistent device keys, and distribution channels are not implemented. The real iOS 17.0 WKWebView gate fails during Noise because a production dependency calls the unavailable `Promise.withResolvers`. The minimum version is iOS 17.4, which provides this standard API.

## Prepare the environment

Install Xcode 26 or later, an iOS Simulator runtime, and the Node and pnpm versions required by `clients/gui/package.json`. See the [official environment requirements](https://capacitorjs.com/docs/getting-started/environment-setup). Testing a newer runtime does not qualify the minimum OS version.

Run installation from the repository root. The mobile package belongs to the GUI workspace and shares `clients/gui/pnpm-lock.yaml`.

```sh
pnpm --dir clients/gui install --frozen-lockfile
pnpm --dir clients/gui mobile:sync
pnpm --dir clients/gui --filter @areal/mobile open
```

`mobile:sync` builds `clients/gui/renderer/mobile/index.html`, then runs `cap sync ios`. The generated SPM library declares iOS 17. The App deployment minimum is iOS 17.4. The library minimum does not expand the OS versions on which the App can install. The build writes only to `clients/gui/dist/mobile/`, which is Capacitor's `webDir`. Desktop and Web Remote builds have separate entries. After changing Web sources, rerun sync, then launch through Xcode or `pnpm --dir clients/gui --filter @areal/mobile exec cap run ios`. This sequence follows the [official development workflow](https://capacitorjs.com/docs/basics/workflow).

The default Bundle ID is the development placeholder `com.example.arealharness`. The gate accepts `AREAL_MOBILE_BUNDLE_ID` and passes it to Xcode as `PRODUCT_BUNDLE_IDENTIFIER`. Before device signing, choose a Bundle ID you own in both the Xcode project and Capacitor configuration, then configure your development team.

## Run the WKWebView handshake gate

Check installed runtimes with `xcrun simctl list runtimes`. The default is iOS 17.5. Select another installed version as needed.

```sh
pnpm --dir clients/gui test:mobile-handshake
AREAL_IOS_RUNTIME=17.4 pnpm --dir clients/gui test:mobile-handshake
```

The script creates an isolated iPhone simulator, trusts an ephemeral fixture CA, and builds and installs a Debug App. The real `capacitor://localhost` WKWebView imports production `channel.mjs` and `wire.mjs`. It exercises strict WSS, Relay, the Noise Host pin, the existing `hello`, fixture Observer approval, inner `ready`, and `project.list`. It also checks rejection of a wrong Host pin, a wrong certificate hostname, and an untrusted CA. Cleanup stops fixtures and removes only the simulator created by this run.

Evidence defaults to `.scratch/ios-remote-v1/mobile-gate/`. Each OS version has JSON results, a build log, and screenshots. Set `AREAL_MOBILE_EVIDENCE` to choose another evidence directory. Set `AREAL_MOBILE_CASES=handshake` to run only the positive path. Missing randomness, `crypto.subtle`, `AbortSignal.timeout`, or `Promise.withResolvers` fails the compatibility gate. The handshake still attempts the existing implementation to distinguish protocol failure from missing runtime capabilities. The script injects no replacement crypto or compatibility polyfill.

The Debug native bridge injects ephemeral pairing parameters only when the launch environment contains `AREAL_MOBILE_PROBE`. Pairing parameters and device private keys stay in process memory. The bridge writes public Peer IDs and sanitized results to the App container, which the runner reads to approve the fixture device. Release builds exclude this bridge. Fixture approval does not qualify desktop human pairing.

This gate qualifies only the tested OS, shell, and current protocol path. It does not qualify real providers, Rust Core execution, device key storage, background recovery, physical installation, or TestFlight.

## Choose later verification tools

Start with native `xcodebuild`, `simctl`, and structured gate results. Evaluate community [MobileBuildMCP](https://github.com/getsentry/MobileBuildMCP) if agents need a common build, launch, and log interface. This project does not depend on it.

Once product screens exist, use [Appium XCUITest hybrid contexts](https://appium.github.io/appium-xcuitest-driver/latest/guides/hybrid/) to test switching between the native shell and Web DOM. Debug builds enable `WKWebView.isInspectable`. Before adopting Maestro, check its [known WebView accessibility limitations](https://docs.maestro.dev/extra-materials/troubleshooting/known-issues).

For internal distribution, use [fastlane pilot](https://docs.fastlane.tools/actions/pilot/) to prepare TestFlight uploads. Distribution credentials and signing are outside the local handshake gate.
