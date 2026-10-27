[中文](ios-remote-v1-spec.md) | **English**

# iOS remote client v1 implementation spec (TestFlight)

## Summary

v1 delivers an iOS app distributed only through TestFlight. The phone is a control surface only. It connects to the Remote Gateway on the computer through an organization's self-hosted Relay, lists authorized projects, creates and opens sessions, sends messages, changes the model, stops the current turn, handles approvals and questions, and receives a push notification when the computer needs the user. All execution, files and credentials stay with Core and Runtime on the computer.

The app uses Capacitor to package the existing Remote Web client's protocol layer and the GUI session components in a native shell. Native code only adds the Keychain, QR scanning, APNs push and foreground/background lifecycle. The protocol stays `areal.remote.v2`, with additions only. The UI follows the mockups and `@areal/ui` tokens in this spec, with no separate styling system.

This page is for implementing engineers and Codex. Every method, field, directory and setting described as "new" is a proposal and must not be described as supported until it is implemented and passes acceptance. The authoritative descriptions of existing behavior remain the [Remote architecture](../design/remote-control.en.md), the [Remote API](../api/remote-control.en.md) and [connectivity and deployment](../guides/remote-control.en.md).

## Scope

| Area | In v1 | Not in v1 |
| --- | --- | --- |
| Platform and distribution | iPhone on iOS 17.4+, TestFlight beta | Android, iPad-specific layout, App Store release, PWA changes |
| Network | Self-hosted Relay (the default and only entry) | Direct (Tailscale Serve/Funnel, organization HTTPS), LAN direct, P2P hole punching |
| Pairing | In-app QR scan, pasted pairing link, fingerprint check and authorization on the computer | Opening the app from the system camera (Universal Link), remembering several computers in one app |
| Projects and sessions | Authorized project list, recent sessions per project, new session, open session, paged history | Session search, archive, rename, Task schedule editing |
| Session actions | Send, append while running (queue), stop the current turn, model/reasoning effort/permission settings | Attachments, voice input, Goal creation and editing, queued message editing, steer |
| Intervention | Synchronous approvals, synchronous questions, Task async question replies, Task pause | Result review and image artifacts, diff viewing |
| Push | Pending items, completion or failure of turns this device started | Rich notifications, approving from a notification, Live Activities |
| Device security | Device identity in the iOS Keychain, clear this device | Face ID confirmation for writes, P-256 hardware-bound identity |

"Pause" in a session means stopping the current turn (`turn.stop`). Task-owned sessions cannot use the ordinary stop and use `task.pause`, as the existing rules require.

## Existing foundations and reuse boundaries

The Remote v2 Gateway, encrypted channel, Relay and most business methods already exist. v1 keeps their semantics and reuses them as follows.

| Capability | Current location | Use in v1 |
| --- | --- | --- |
| Gateway, authorization, command mapping | `clients/gui/app/src/core/remote*.cjs` | No business logic changes; add the push registration methods and the notifier |
| Noise encrypted channel | `clients/gui/packages/remote/src/channel.mjs` | Reused as is |
| Relay transport wrapper | `clients/gui/packages/remote/src/wire.mjs` | Reuse `createRemoteWire` and `remoteLocator` as is; the app builds the socket from the saved Relay origin |
| Relay service | `services/remote-relay/` | Add an app origin allowlist and APNs push forwarding |
| Protocol client and state | `clients/gui/renderer/remote-web/` (`browser-state.mjs`, `command-state.mjs`, `session-state.mjs`, `session-bodies.mjs`) | Extract the DOM-free parts for the app; make storage injectable |
| Session UI | `Messages`, `ConversationComposer`, `ComposerQueue`, `ComposerPermissionMenu` as used in `clients/gui/renderer/src/remote/RemoteWorkbench.tsx` | The session screen reuses them directly without copying |
| Design foundations | `clients/gui/packages/ui` (`tokens.json`, `themes.css`, `foundation.css`, DecisionCard, QuestionCard, FeedbackNotice and others) | Every color, radius and font size comes from a token |
| Pairing and authorization on the computer | `clients/gui/renderer/src/settings/MobileSettings.tsx`, `remoteControl` `pair/approve/updateGrant/revoke` | Flow unchanged; the device list shows the device kind and push status |

The plain DOM pages in `remote.html` (connection, pairing, approval, Task pause) and the hard-coded colors in `remote-web/remote.css` do not go into the app. The app rebuilds those pages with `@areal/ui` components.

## Architecture

```text
iPhone app (Capacitor shell, WKWebView)
├─ UI             React + @areal/ui; the session screen reuses GUI components
├─ View state     overview pages, current session snapshot, drafts, commandIds to verify (disposable projections)
├─ Protocol       areal.remote.v2: hello/ready, request correlation, commandId, unknown = query only, never resend
├─ Secure channel @areal/remote Noise + Host pin
├─ Transport      Relay WSS (areal.relay.v1 client role)
└─ Platform       KeyStore (Keychain) · Scanner (QR) · Push (APNs) · Lifecycle (foreground/background)
        │  outbound WSS
        ▼
Self-hosted Relay (services/remote-relay) ── new: APNs forwarding ──► APNs ──► iPhone
        ▲  Host outbound WSS (capability proves the room)
        │
Computer: desktop background RemoteControl / Gateway ── new: notifier
        │
        ▼
Per-project Core (sole authority for sessions and execution) → Runtime
```

The platform layer is the only place where the app and the Web client differ. Its interfaces are below (TypeScript sketch; names may change):

```ts
interface KeyStore {
  load(): Promise<StoredDevice | null>;      // device key, Host pin, Relay origin, room, grant revision
  save(device: StoredDevice): Promise<void>; // atomic; must throw on failure and never report "remembered"
  clear(): Promise<void>;
}
interface Scanner { scan(): Promise<string | null> }          // returns the raw pairing link
interface Push {
  permission(): Promise<"granted" | "denied" | "prompt">;
  register(): Promise<{ token: string; environment: "production" | "development" }>;
  onOpen(handler: (payload: PushOpen) => void): void;          // the user opened a notification
}
interface Lifecycle { onActive(fn: () => void): void; onBackground(fn: () => void): void }
```

## Repository layout and build

The minimum OS version is iOS 17.4. The existing Remote dependencies use `Promise.withResolvers()`, available since Safari 17.4. The App keeps the existing encryption library and standard APIs without a compatibility layer.

See the [iOS development workflow](ios-development.en.md) for the current shell build, simulator gate, and tool choices. That guide separates development evidence from full acceptance in this spec.

| Path | Contents |
| --- | --- |
| `clients/gui/packages/remote-client/` (new) | Protocol client, command state and session state extracted from `renderer/remote-web/`; imports no DOM, IndexedDB or Capacitor; storage injected through `KeyStore` |
| `clients/gui/renderer/mobile.html`, `clients/gui/renderer/src/mobile/` (new) | The app's web entry and screens; Vite gains a `mobile` build entry that outputs to `clients/gui/dist/mobile/` |
| `clients/mobile/ios/` (new) | Capacitor iOS project; `webDir` points at the build output above; local Swift plugin `ArealKeychain` |
| `services/remote-relay/src/push.mjs` (new) | APNs HTTP/2 client (Node's built-in `http2` and `crypto` sign the ES256 JWT; no new dependencies) |

Constraints:

- Pin exact versions of Capacitor and its plugins, and use only the official `@capacitor/core`, `@capacitor/ios`, `@capacitor/app`, `@capacitor/push-notifications` and `@capacitor/barcode-scanner`. Implement Keychain access as an in-repo Swift plugin of about 100 lines, with no third-party secure storage plugin.
- The existing PWA (`remote.html`) keeps building and passing its tests. After the extraction it imports from `remote-client` with unchanged behavior.
- Signing certificates, provisioning profiles, the APNs `.p8` key and App Store Connect credentials never enter the repository. The bundle ID is a setting with the placeholder `[BUNDLE_ID]`.
- The app registers no Service Worker. `mobile.html` sets a strict CSP: `script-src 'self'`, `connect-src` limited to `wss:`, no third-party scripts.

The first PR must verify one thing before anything else: the WebCrypto and randomness that `@chainsafe/libp2p-noise` relies on work in WKWebView under `capacitor://localhost` and complete a real Relay handshake. If they do not, stop and report; do not replace the crypto library on your own.

## Pairing and connection

### Pairing link

On the computer, `remoteControl.pair({transport:"relay"})` already produces `https://<relay-origin>/#host=<hostPin>&invite=<64 hex>&room=<64 hex>`, valid for 120 seconds and single-use. The app keeps this format.

1. On first launch the app shows "Connect to your computer": primary button "Scan pairing QR code", secondary "Paste pairing link". Help text: "On your computer, open Settings → Phone connection, choose Relay and generate a pairing QR code."
2. Parse the link: the origin must be `https:` with no path or user info; validate `host` and `room` in the fragment with `remoteLocator`; `invite` must be 64 hex characters. Drop the raw link string from memory right after parsing. The invite secret lives only in this pairing flow's variables and is never logged or written to the Keychain.
3. Build `wss://<relay-host>/remote/socket` (the same path the current Relay client uses) from the Relay origin, pass it to `createRemoteWire(socket, {room})`, then run the existing Noise handshake. Abort without sending the invite if the peer key does not match `host`.
4. After the check passes, send `inviteSecret` in hello with `clientKind: "ios"` (a new field, below). The display name defaults to the iOS device name (for example "sailfish's iPhone") and can be edited before pairing.
5. On `pairing`, show "Confirm on your computer" with this device's full fingerprint and ask the user to compare it character by character. The computer selects projects and the Observer/Operator preset, confirms, and returns `ready` after the grant is saved.
6. On `ready`, write the device key, Host pin, Relay origin, room and grant revision to the Keychain atomically. If the write fails, report it clearly: "You can use the app now, but you will need to pair again next time."

v1 always remembers the device and drops the "this session only" option: the app is installed on a personal device and the Keychain is stronger than browser storage. Keychain items use `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` and are excluded from iCloud sync and backup migration.

### Connection lifecycle

- App becomes active: read the Keychain → open the Relay connection → Noise check against the Host pin → hello (no invite) → `ready` → fetch `project.list` and what the current screen needs → for pending `commandId`s, call `command.read` only.
- App goes to the background: close the WebSocket, release subscriptions, keep drafts in memory. Request no background keep-alive.
- Reconnect with the existing rules: 0.5–30 second jittered backoff. Grant changes, protocol incompatibility and a `FORBIDDEN` reauthentication refusal stop automatic retries and show the reason.
- Connection state appears at the top of the projects screen: "Connected · Can operate / View only", "Connecting…", "Computer offline", "Access revoked, pair again". "Computer offline" must never be shown as the task having stopped.
- Settings offers "Clear this device": disconnect first, then clear the Keychain, and remind the user to revoke the device on the computer as well.

### Relay change: allow the app origin

The current Relay requires a client's `Origin` to be in `allowedClientOrigins` and to share the scheme of `publicOrigin` (https). WKWebView connects from `capacitor://localhost` and would be rejected.

Add the setting `allowedAppOrigins` (string array, empty by default) that accepts exact values only; the v1 docs use `["capacitor://localhost"]` as the example. Each value must have the form `scheme://host`, and the scheme must not be `http`, `https`, `ws` or `wss`. Both Origin checks, at the WebSocket upgrade (the `upgrade` handler in `relay.mjs`) and at client-role registration, accept a match in either `allowedClientOrigins` or `allowedAppOrigins`.

This does not weaken security. A native app can forge `Origin` anyway, and the Relay never treats Origin as identity: the Noise pin decides the Host identity and the DeviceGrant decides permissions. The docs must say so.

## Features and protocol mapping

All methods are existing `areal.remote.v2` methods unless marked "new". Every write carries a UUID `commandId`, generated before the first submission and saved with the draft. When a result is unknown, show "Needs check" and call `command.read` only; never resend automatically.

| Screen / action | Method | Notes |
| --- | --- | --- |
| Projects | `host.describe`, `project.list` | Each card shows the name and a summary: running count, pending count, last update. The summary comes from the first `work.list` page (`filter: all`), requested only for online projects |
| Sessions in a project | `work.list` (`filter: all`, 30 per page) | Each row: title, status, time. Status derives from `execution` and `attentionRefs` (table below). `kind: taskRun` rows are Task rows that open the Task detail |
| Open session | `session.open`, `session.history`, `subscription.close` | One foreground session; `subscription.close` when leaving the screen or going to the background |
| New session | `project.models` (new, read-only) → `session.create` → `session.open` → optional `session.control(configure)` → `session.send` | See the order below |
| Send | `session.send` | Sent directly when idle; while running, add `enqueue: true, expectedTurnId` to queue it |
| Stop the current turn | `turn.stop` (`expectedTurnId`) | Task-owned sessions return `TASK_CONTROL_REQUIRED`; the UI then offers "Pause Task" |
| Model, reasoning effort, permissions | `session.control` with `operation: configure` and `values` of `model`, `parameters`, `options` | Editable only while the session is idle; while running the sheet is read-only and says "Change this after the current turn ends" |
| Approvals, synchronous questions | `attention.list`, `attention.read`, `interaction.respond` | An approval needs the full arguments and `argumentsDigest` first; the user approves only after seeing them |
| Task async questions | `task.question.read`, `task.question.reply` | |
| Task pause | `task.read`, `task.pause` | The user must tick "I have checked this Task" |
| Push registration | `device.push.register`, `device.push.unregister` (new) | See "Push notifications" |

### New session order

When the user writes the first message on the "New session" screen and taps send:

On entering the new-session page, `project.models` reads at most 200 catalog entries for the current project without creating a thread or subscription. The initial badge says “Computer default”; the catalog does not establish configuration defaults. If an older Host omits the method, model selection asks for an upgrade.

1. `session.create` with a new `commandId` returns `threadId`.
2. `session.open` obtains the atomic baseline and configuration revision.
3. If the user changed the model, reasoning effort or permissions, call `session.control(configure)` using the baseline’s `configRevision` as `expectedRevision`.
4. `session.send` sends the first message.
5. Navigate to the session page.

If any step's result is unknown, stop at that step and show "Needs check" without continuing. If step 1 succeeded and a later step failed, the session exists: navigate to it and keep the draft so the user can tap send again. When the Host default profile binds a Workflow, `session.create` returns `UNSUPPORTED_PROFILE`; show "Choose an ordinary profile on your computer."

### Session status display

Status text always uses `--color-foreground-subtle`; color appears only on the 7px dot.

| Status | Condition | Dot token |
| --- | --- | --- |
| Needs you | `attentionRefs` is not empty | `--color-status-attention` |
| Running | `execution` shows an active Turn or Run | `--color-status-running` |
| Failed | The latest turn failed | `--color-status-error` |
| Needs check | This device has an unconfirmed `commandId` | `--color-status-unknown` |
| Done / idle | Anything else | No dot |

Time comes from `sourceUpdatedAt`; when it is null, show nothing instead of substituting the current time. The session title comes from `title`; when empty, show "Untitled session" instead of truncating the first prompt.

## Push notifications

Push only brings the user back into the app. It carries no session content and grants nothing. When the user opens a notification, the app connects normally, reads the latest state, then shows the matching screen.

### End-to-end flow

1. **Permission**: after pairing, the first visit to the projects screen shows an explanation card asking for notification permission ("Get notified when a task on your computer needs your confirmation"). Do not show the system prompt at first launch. If the user declines, settings shows "Notifications are off. Turn them on in iOS Settings."
2. **Registration**: once the app has an APNs device token, it calls `device.push.register` over the authenticated Noise channel, and again whenever the token changes.
3. **Host storage**: the Gateway writes the token into a new `push` field on that device's DeviceGrant, saved encrypted in `remote.json`. Revoking or clearing the device, or `device.push.unregister`, deletes it.
4. **Host events**: when the notifier finds an event to report (table below), it sends one `push` message over the existing Host–Relay WSS for each registered device that has no live connection.
5. **Relay forwarding**: the Relay signs a JWT with the APNs key the administrator configured and delivers through the APNs HTTP/2 API. The Relay stores no tokens and logs no notification content.
6. **Opening**: the app reads `projectId`, `threadId` or the attention reference from the payload and opens that screen after connecting. If the target no longer exists, it returns to the projects screen with "This item was already handled or has expired."

### Events

| Event | Trigger | Notification text (fixed) | Recipients |
| --- | --- | --- | --- |
| New pending item | A new approval, synchronous question or Task async question appears in an authorized project | Title "AReaL", body "1 item on your computer needs your confirmation" | Devices authorized for that project with the `answer` capability |
| Turn completed | The turn of a `session.send` this device submitted completes | "A session you started on your phone has finished" | The device that sent the command |
| Turn failed | Same, but the turn failed or was interrupted | "A session you started on your phone did not finish" | The device that sent the command |

Notification text never includes project names, session titles, prompts or tool arguments. Pending items in the same project within 30 seconds merge into one notification whose body becomes "N items on your computer need your confirmation", using APNs `apns-collapse-id`. A device with a live connection receives no push.

### Host notifier (new)

It sits next to `RemoteControl` in the desktop background, reuses the bounded queries in `remote-work-overview.cjs`, creates no new Core state and subscribes to no full history.

- It works only for online projects that at least one push-registered device is authorized for.
- It reads that project's attention summary every 5 seconds. The first read after the notifier starts or a project comes online only sets a baseline and sends nothing, so restarts do not repeat notifications.
- It deduplicates by the attention reference's native identity; each reference notifies once.
- Turn completion follows this device’s existing `session.send` journal association, using the exact turnId or the turnId bound to its queueItemId, never a guessed latest turn. At most 16 watchers share existing native subscription budgets and release on terminal state, revocation or invalidation. Terminal startup baselines are not replayed. Old turns absent from bounded baselines, removed queue items or exhausted capacity can miss notifications.
- Each project cycle allows at most eight attention reads, each with at most four native overview pages. Push waits for a complete initial baseline and retains at most 4096 native attentionRefs. The first notification sends immediately; events within 30 seconds reuse the collapse ID and update the count. Incomplete reads and capacity exhaustion make delivery best effort.
- When the Relay does not advertise push, is disconnected or reports rate limiting, it drops that notification and records a redacted diagnostic. It does not queue retries and affects no business path.

### Protocol additions

`device.push.register` requires `observe` and a `commandId`:

```json
{"id":"rpc-7","method":"device.push.register","commandId":"<uuid>",
 "params":{"platform":"apns","token":"<hex device token>","environment":"production"}}
```

- `token` is 64–200 hex characters. `environment` accepts only `production` (TestFlight uses production APNs) or `development` (Xcode debugging).
- Success returns `{registered:true}`. If the Relay does not support push, it returns `RESOURCE_UNAVAILABLE` and settings shows "Push is not enabled on this Relay."
- `device.push.unregister` uses empty `params:{}`, removes this device’s token and returns `{registered:false}`. Both registration and unregister omit project context.
- Push writes and receipts commit in the same encrypted `remote.json` save. After a lost response, only context-free `command.read {params:{commandId}}` queries this device’s receipt. Known outcomes return `receipt:{registered}`; notFound remains unknown and cannot authorize replay. The Host retains at most 4096 receipts and refuses new writes at capacity without evicting unresolved records.

hello gains an optional `clientKind: "web" | "ios"`, used only for the device list on the computer and never for authorization. When the Relay supports push, `capabilities` in `ready` and `host.describe` include `push`. Update the implemented boundary and the C4 method catalog of the [Remote API](../api/remote-control.en.md) together with these changes.

### Relay additions

New optional setting (push is unsupported when absent):

```json
"apns": {
  "teamId": "[TEAM_ID]",
  "keyId": "[KEY_ID]",
  "keyFile": "/etc/areal-relay/apns.p8",
  "bundleId": "[BUNDLE_ID]",
  "maxPerHostPerMinute": 60
}
```

- Push-capable Hosts send `X-Areal-Relay-Capabilities: push` during WSS upgrade. Only these Hosts receive `push: true|false` beside `limits` in `ready`; legacy Hosts retain the original shape. Legacy Relays ignore the header and omit `push`, meaning unavailable. The Host uses this value to decide whether to advertise the `push` capability to the app.
- New outer message sent by the Host: `{"type":"push","token":"…","environment":"production","collapseId":"…","kind":"attention|turnCompleted|turnFailed","count":1,"target":{…}}`. Accepted only from registered host-role connections. `target` allows only three opaque string fields: `projectId`, `threadId` and `attentionRef`.
- The Relay maps `kind` to the fixed text above; the Host cannot send arbitrary notification text.
- Re-sign the JWT every 50 minutes. When APNs returns `410 Unregistered`, send `{"type":"pushResult","token":"…","status":"unregistered"}` back to the Host, which deletes the token.
- Logs contain only the time, route ID, `kind` and APNs status code, never the full token or the target.

## UI and design system

### Mockups

Screens follow the mockup [AReaL 手机端界面](https://claude.ai/artifact/JcRBzKWVyjbu1j7K8Fj4cQ): five screens aligned to the `@areal/ui` light theme tokens.

1. **Projects**: computer name and connection status at the top, settings at the top right, the page title "Projects", a list of project cards.
2. **Sessions in a project**: back, project name, a full-width "New session" primary button, the "Recent sessions" list, "Show earlier sessions".
3. **New session**: empty state "What should happen in <project>?", a Composer at the bottom with model and permission buttons.
4. **In a session**: back, title, project name and status at the top; the message stream; the Composer at the bottom, whose primary button becomes stop while running.
5. **Model and permission sheet**: a bottom sheet with the model list, three reasoning effort segments, three permission options and "Done".

Screens v1 needs that the mockups do not show: connect to computer (scan/paste), waiting for confirmation, approval and question detail, Task detail and pause, settings (device info, notification status, clear this device), and the offline and revoked states. Build them from existing `@areal/ui` components: `DecisionCard` for approvals, `QuestionCard` for questions, `FeedbackNotice` for status feedback, `SettingsRow` and `SettingsGroupCard` for settings rows, `Button` for buttons.

### Token mapping

Every value in the mockups maps to a token below. Implementation must reference CSS variables only and never copy the mockup's hex or px literals.

| Use | Token |
| --- | --- |
| Body text, primary button fill | `--color-foreground`, `--color-primary`, `--color-primary-foreground` |
| Secondary and status text | `--color-foreground-subtle` |
| Card, selected row and in-sheet list fill | `--color-hover` / `--color-navigation-selected` |
| Dividers | `--color-border` |
| User message bubble | `--color-user-message`, `--color-user-message-text` |
| Selection check | `--color-brand` |
| Sheet backdrop | `--color-dialog-backdrop` |
| Status dots | `--color-status-running`, `--color-status-attention`, `--color-status-error`, `--color-status-unknown`, `--color-success` (connected) |
| Radii | card `--radius-card`, list row `--radius-navigation`, primary button `--radius-control`, small button `--radius-button`, bubble `--radius-message`, Composer `--radius-composer`, pill `--radius-pill`, bottom sheet `--radius-overlay` |
| Font sizes | page title `--text-fixed-page-title`, sheet title `--text-fixed-section-title`, project name `--text-fixed-emphasis`, list title `--text-fixed-control`, body `--text-fixed-body`, label `--text-fixed-label`, caption `--text-fixed-caption`, inputs `--text-mobile-input-safe` |
| Fonts | `--font-sans`, `--font-mono` |
| Shadows | Composer `--composer-shadow-light`, selected segment `--shadow-raised-control` |
| Spacing | `--spacing-inline`, `--spacing-field`, `--spacing-section`, `--spacing-panel` |
| Small label tracking | `--tracking-wf-label` |

`--color-status-attention` (`--color-warning`) and `--color-status-error` (`--color-destructive`) lack text contrast on white, so they are used only for dots and icons. Dark mode uses the existing `.dark` values in `themes.css` and follows the iOS system appearance.

Values the phone needs that have no token yet go into `packages/ui/tokens.json` first, for example the 44px minimum touch target (suggested name `--size-touch-target`) and the sheet grabber size. Do not add literals to the app's CSS.

### Design system rules applied

This section adopts rules from the design system improvement proposal (modeled on Raft: rules bound to tests, layered component reuse). That proposal is not final; this spec takes only the parts that matter for v1 and do not conflict with current rules. If the final version differs, the final version wins.

- **Layers**: app screens are the L4 page layer. They compose only L2 pattern parts (`DecisionCard`, `ComposerSurface` and so on) and L3 domain compositions (`Messages`, `ConversationComposer`). Page CSS handles layout only and never targets `.areal-*` component internals with selectors. A different look needs a component variant or slot, added in `packages/ui`.
- **Values come only from tokens**: page and component CSS contain no px or color literals; new mobile component CSS joins the existing `literal-baseline.json` check.
- **Push-down rule**: if Remote Web also needs the project card or session row, build it as an L2 part in `packages/ui`; if only the app uses it, keep it in `src/mobile/`.
- **Copy**: all UI text goes through the existing Chinese and English message catalogs (`renderer/src/i18n/messages/`), never hard-coded in components. The hard-coded "Projects" and "Show more" in today's Remote Web stay out of the app.

The session screen reuses the GUI message stream and Composer directly, so once the conversation flow and Composer redesign lands, the app inherits its activity rows, grouping and placeholder text without a separate implementation. Until then, the app's Composer placeholders follow that proposal: "描述你要完成的事…" (describe what you want done) for a new session and "补充要求，会在当前步骤后处理" (add a requirement; it runs after the current step) while running.

### Mobile interaction conventions

- Touch targets are at least 44×44pt; inputs use at least 16px text so iOS does not zoom on focus.
- Screens respect `env(safe-area-inset-*)` around the notch and home indicator; the Composer stays above the keyboard.
- Lists support pull to refresh; scrolling to the top of a session loads earlier history (`session.history`).
- Back is the top-left button plus the iOS edge swipe.
- Follow existing accessibility rules: icon buttons have `aria-label`, and status changes are announced with `role="status"`.

## Security

- Network reachability or a scanned QR code is never authorization; authorization comes only from the local confirmation on the computer. The app neither stores nor sends any Core or desktop credentials.
- The invite secret exists only in memory during pairing and is never written to logs, the Keychain or crash reports. The app includes no third-party analytics or crash reporting SDKs.
- Push payloads carry no business content. Notifications offer no approve button; approvals are completed inside the app after the arguments are shown.
- After revocation the app receives the existing `FORBIDDEN` authentication refusal on its next connection, clears local session projections and asks the user to pair again. The device identity stays in the Keychain until the user chooses "Clear this device".
- The pairing and authorization screens keep the warning that the phone can see session content in the selected projects and can use the current execution permissions through the Agent.

## Implementation order (PR slices)

Each PR merges on its own and updates the matching docs.

| # | Contents | Done when |
| --- | --- | --- |
| 1 | Capacitor iOS shell, Relay `allowedAppOrigins`, and Noise handshake check inside WKWebView | The simulator completes one `hello`/`ready` against a local strict-TLS Relay fixture; Relay tests cover accepted and rejected App origins |
| 2 | Extract `@areal/remote-client`; the PWA imports from it | All existing `test:remote-*` pass and PWA behavior is unchanged |
| 3 | Relay deployment configuration | Enable the `allowedAppOrigins` support from slice 1 for the self-hosted deployment; verify the exact App origin |
| 4 | Keychain plugin, scanning, pasted links, pairing and waiting screens | Pairing by scan works on a device; relaunching after a force quit needs no pairing; clearing the device requires pairing again |
| 5 | Projects, session list, session screen (read only) | Authorized projects and sessions appear; an open session shows history and live updates |
| 6 | New session, send, queue, stop, model sheet | Follows "New session order"; unknown results are queried, never resent |
| 7 | Approvals, questions, Task questions and pause | After approving on the phone, the Turn continues on the computer |
| 8 | Push: protocol methods, Host notifier, Relay APNs forwarding, app registration and open handling | Acceptance items 7 and 8 |
| 9 | TestFlight packaging notes and acceptance record | Beta users install from TestFlight and complete every acceptance item |

## Acceptance

Accept on a real iPhone (TestFlight build), a real self-hosted Relay (public HTTPS) and a computer running the desktop background, recording the source commit, iOS version and Relay version. Simulators and local fixtures are development evidence only and do not replace these results.

1. The computer generates a Relay pairing QR code, the app scans it, the computer checks the fingerprint and authorizes two projects (Operator), and the app shows both projects.
2. After a force quit and relaunch, the app connects without pairing again.
3. Create a session in a project, pick a non-default model and send the first message; the computer shows the same session with the same model.
4. While the session runs, append a message; it is queued and runs after the current turn. Tap stop while running; that turn stops on the computer.
5. Open a session created on the computer; earlier history loads on scroll, and new messages from the computer appear on the phone live.
6. The Agent requests approval; the phone shows the full arguments and approves; the computer continues. A rejection reaches the computer as a rejection.
7. With the phone locked, a new approval on the computer produces a notification within 10 seconds; opening it goes straight to that approval. The body contains no project name or content.
8. With the app in the foreground no push arrives. After the computer revokes the device, new approvals produce no push, and the app reports the revoked access on its next connection.
9. Disconnect the computer's network; the app shows "Computer offline". After recovery it reconnects on its own, unconfirmed sends show "Needs check" and resolve to their results, and nothing is sent twice.
10. Every screen is readable in dark mode with colors from tokens; the `literal-baseline.json` check passes.

## Assumptions and open questions

- The design system part adopts the layering, token and placeholder rules from the design system improvement proposal and the conversation flow and Composer redesign. Neither proposal is final; if the final versions differ, they win.
- The organization has an Apple Developer team, can configure its own APNs key on the Relay and signs the TestFlight build with its own team.
- One app installation remembers one computer. Switching computers means clearing the device and pairing again.
- Model lists come from the computer’s `project.models` or the same catalog projection in session snapshots. The App maintains no independent catalog.
