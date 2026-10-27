[中文](ios-development.md) | **English**

# Verify the iOS mobile shell

The mobile shell uses Capacitor 8.5.3 and Swift Package Manager. `clients/mobile/ios/` is the tracked Xcode project, with an iOS 17.4 deployment target. iOS 17.5 passes the real WKWebView gate. iOS 17.4 still requires verification on that runtime. The mobile entry provides QR scanning or pasted Relay pairing links, a desktop confirmation waiting page, connection status, and device clearing. A local Swift plugin persists the device identity in iOS Keychain. Project and conversation screens and distribution channels are not implemented yet. The real iOS 17.0 WKWebView gate fails during Noise because a production dependency calls the unavailable `Promise.withResolvers`. The minimum version is iOS 17.4, which provides this standard API.

## Prepare the environment

Install Xcode 26 or later, an iOS Simulator runtime, and the Node and pnpm versions required by `clients/gui/package.json`. See the [official environment requirements](https://capacitorjs.com/docs/getting-started/environment-setup). Testing a newer runtime does not qualify the minimum OS version.

GUI builds follow the GUI Node engines, while the Relay CLI requires Node 24.2.0. When these differ, set `AREAL_RELAY_NODE` to the Relay Node executable. The main runner and pnpm keep using the supported GUI Node. This test variable does not bypass the Relay version check; evidence records both versions.

Run installation from the repository root. The mobile package belongs to the GUI workspace and shares `clients/gui/pnpm-lock.yaml`.

```sh
pnpm --dir clients/gui install --frozen-lockfile
pnpm --dir clients/gui mobile:sync
pnpm --dir clients/gui --filter @areal/mobile open
```

`mobile:sync` builds `clients/gui/renderer/mobile/index.html`, then runs `cap sync ios`. The generated SPM library declares iOS 17. The App deployment minimum is iOS 17.4. The library minimum does not expand the OS versions on which the App can install. The build writes only to `clients/gui/dist/mobile/`, which is Capacitor's `webDir`. Desktop and Web Remote builds have separate entries. After changing Web sources, rerun sync, then launch through Xcode or `pnpm --dir clients/gui --filter @areal/mobile exec cap run ios`. This sequence follows the [official development workflow](https://capacitorjs.com/docs/basics/workflow).

The default Bundle ID is the development placeholder `com.example.arealharness`. The gate accepts `AREAL_MOBILE_BUNDLE_ID` and passes it to Xcode as `AREAL_MOBILE_BUNDLE_ID`. Before device signing, choose a Bundle ID you own in both the Xcode project and Capacitor configuration, then configure your development team.

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

## Verify pairing and device storage

The app uses official `@capacitor/app` 8.1.2 for lifecycle events and official `@capacitor/barcode-scanner` 3.1.3 for QR scanning. The native `Info.plist` contains the camera permission explanation. Scanning requires an actual iPhone test; simulator paste tests cannot replace it.

The local `ArealKeychain` plugin stores one computer's device identity, Host pin, Relay origin, room, grant revision, and unresolved command locators. The single Keychain item uses `AfterFirstUnlockThisDeviceOnly` with synchronization disabled. Updates use atomic `SecItemUpdate`; first writes use `SecItemAdd`. A failed save reports that the current connection works but pairing is required next time. Invitation secrets and input drafts stay in memory. Capacitor `loggingBehavior` is set to `none` so native plugin responses cannot place identity records in debug logs.

Backgrounding closes the connection and releases subscriptions. Foregrounding reloads Keychain and reconnects with the same Host pin. Clearing the device disconnects before deleting the Keychain item; the user must also revoke the previous grant on the computer. Revocation and incompatible protocols stop automatic reconnects.

```sh
node --test clients/gui/scripts/mobile-device-store.test.mjs
AREAL_RELAY_NODE=/path/to/node-24.2.0/bin/node node clients/gui/scripts/mobile-pairing-smoke.mjs
```

The pairing runner uses an isolated simulator, a local Relay with strict TLS, and production RemoteControl. Its DEBUG driver operates actual DOM inputs and buttons through real protocol authorization and native Keychain. It checks pairing, restore after process termination, backgrounding through Settings and returning to the app, desktop revocation, explicit clearing, the unpaired state after another restart, and the dark appearance. Observations contain only state, Keychain presence, grant revision, and the public device fingerprint. Evidence is saved in `.scratch/ios-remote-v1/mobile-pairing/`; `AREAL_MOBILE_EVIDENCE` overrides the location. The native driver entry exists only in DEBUG builds.

These gates are development checks. Physical QR scanning, iOS 17.4, real desktop confirmation, recovery from denied camera permission, VoiceOver, and TestFlight each require separate acceptance. When the reference image is unavailable, screenshots document the implementation and do not establish pixel parity.

## Choose later verification tools

Start with native `xcodebuild`, `simctl`, and structured gate results. Evaluate community [MobileBuildMCP](https://github.com/getsentry/MobileBuildMCP) if agents need a common build, launch, and log interface. This project does not depend on it.

Once product screens exist, use [Appium XCUITest hybrid contexts](https://appium.github.io/appium-xcuitest-driver/latest/guides/hybrid/) to test switching between the native shell and Web DOM. Debug builds enable `WKWebView.isInspectable`. Before adopting Maestro, check its [known WebView accessibility limitations](https://docs.maestro.dev/extra-materials/troubleshooting/known-issues).

For internal distribution, use [fastlane pilot](https://docs.fastlane.tools/actions/pilot/) to prepare TestFlight uploads. Distribution credentials and signing are outside the local handshake gate.
