[中文](t3code-borrowing-spec.md) | **English**

# Borrowing from T3 Code: Admission Records, Scheduled Tasks, and an In-Repo Lint Plugin

## Summary

This spec brings three directly transferable designs from [T3 Code](https://github.com/pingdotgg/t3code/tree/f41518f3bc2672c419871c02a3c6728d0f627142) into AReaL-Harness. They are split into three independent work packages, one PR each:

| Work package | Problem | T3 design borrowed |
| --- | --- | --- |
| A. Admission records for creation requests | Requests such as starting a session stay "awaiting verification" indefinitely after a Core restart or disconnect, and the UI cannot reach a conclusion | Write the receipt before executing; after process loss, settle by action type and never leave a state with no end |
| B. Parked scheduled runs | Once a run is paused or blocked, every later trigger is skipped | A trigger only hands work to a session; the session's later state does not block the next trigger |
| C. In-repo oxlint plugin | Design and engineering conventions live in documents and standalone scripts and are not reliably checked on change | Custom in-repo lint rules, each with tests, and every suppression must state a reason |

Recommended order: A and C in parallel; B first delivers a design note, and code starts only after a maintainer confirms it. Every new method, field, state, and directory in this document is a proposal and must not be described as supported elsewhere until it is implemented and accepted.

Baselines: T3 Code `f41518f3`, AReaL-Harness main `1d61188`. This is a static source comparison; neither application was run.

## Handing work to Codex

Open one Codex task per work package. The prompt needs four parts and should point to the matching section of this document instead of pasting it:

```text
Goal: Implement work package A of docs/development/t3code-borrowing-spec.md.
Context: That section's "Current state" and the files it lists; repository rules are in AGENTS.md.
Constraints: That section's "Constraints" and "When to stop and ask".
Done when: Every item in that section's "Done when" holds, with evidence in the PR.
```

- Reasoning effort: high for A and B, medium for C.
- Start B in Plan mode and produce only a design note (in the PR description or `PLANS.md`) for maintainer confirmation before implementing.
- Repository-wide rules (layering, paired Chinese/English docs, test layers, PR template, Agent improvement gates) come from AGENTS.md and are not repeated here.
- Within a work package, Codex decides reversible implementation choices that stay inside that package and explains them in the PR. Only the cases under "When to stop and ask" need a question first.

## Work package A: Admission records for creation requests

### Goal

Every write request that carries a `requestId` gets a definite answer when the GUI asks Core about it. No entry stays "awaiting verification" forever.

### Current state

- Management writes already have a durable admission journal: `core/engine/src/desktop/submissions.rs` writes records to `desktop/submissions.json` before executing; on restart `accepted` becomes `unknown`; a failed write is marked `unconfirmed`. This matches T3's command receipts and should be kept and reused.
- Creation requests (`areal/thread/start`, `areal/thread/fork`, `areal/side/start`, `areal/side/create`) do not use this journal. Their receipt lives in the new session's own `DesktopState.receipts` (`create_configured` in `core/engine/src/desktop/state.rs`). If Core exits before the session is persisted, no record of the request exists anywhere.
- `find_request` (`state.rs:1252`) locks every session in turn to scan receipts for a requestId. This slows down as sessions grow and contends with running sessions.
- On the GUI side, `clients/gui/app/src/core/submission-recovery.cjs` keeps a missing receipt as UNKNOWN and never resubmits; the comment at line 238 says "Creation has no public Core receipt lookup". These UNKNOWN entries appear in unrelated places such as the plugin page.

### Target behavior

`areal/request/read` returns one of the following answers for `(identity, requestId)`. Field names and encoding are up to the implementation; the meaning must match:

| Answer | Meaning | GUI handling |
| --- | --- | --- |
| Completed | A result exists; creation includes the new session ID | Remove the pending entry and refresh from the result |
| Rejected or failed | Core explicitly did not execute or execution failed, with a reason | Show the reason where the request started; the entry ends |
| In progress | The current Core process admitted it and has not finished | Keep waiting |
| Interrupted | An earlier Core process admitted it and exited, and Core can determine that no side effect happened (for example, the session was never created) | Show "Interrupted by a Core restart; no session was created" with a "Start again" action |
| Not admitted | The admission journal has no record of it | Allow resending with the **original requestId**; the journal makes the resend idempotent |
| Undetermined | An earlier process admitted it and exited, and Core cannot tell whether a side effect happened | Show it only at the entry's own location, with "I've checked, remove" |

"Interrupted" is T3's handling of non-replayable actions after process loss: record the reason and end, never retry automatically. For creation requests, Core checks unfinished journal records at startup: if the session exists, the record becomes "Completed"; if not, it is settled as "Interrupted".

### Constraints

- The admission record must be persisted before any side effect. The "Not admitted" answer depends on this.
- The journal does not evict records within a deployment's lifetime. When full it rejects new requests (the management journal's current behavior); silently dropping old records would turn "Not admitted" into a false answer.
- Existing `submissions.json` files and in-session `receipts` must load unchanged, and receipts in old sessions remain queryable.
- Lookup goes directly to the requestId instead of locking every session.
- The GUI may treat "Not admitted" as final only after the transport call for that send has ended (success, failure, or timeout). While the request is still in flight it keeps waiting.
- A pending entry is shown only where it was started. For example, a session-creation entry appears in the session list, not on the plugin page or in a global banner.
- Protocol changes update the Rust protocol types, the generated schemas, `docs/api/core.md`, and the GUI contract types together.

### When to stop and ask

- A creation method turns out to produce an external side effect (such as starting a process or writing to the workspace) before the session is persisted, so "Interrupted" cannot be told apart from "Undetermined".
- The change would alter the management journal's capacity, format, or restart semantics.

### Done when

- Core tests cover: exit after admission but before the session is persisted → "Interrupted" after reopening; session persisted → "Completed" with the session ID; a never-sent requestId → "Not admitted"; resending the same requestId after "Not admitted" → exactly one session; same requestId with different parameters → conflict (existing behavior).
- Counterexample check: temporarily move the admission write after the side effect and confirm at least one of the tests above fails. Note in the PR that this was done and which test failed, then revert.
- GUI tests cover the mapping of all six answers and that "Not admitted" received while the request is in flight does not end the entry.
- Starting from an older data directory (with `submissions.json` and sessions holding receipts) returns the same query results as before the upgrade.
- The plugin page no longer shows pending entries unrelated to plugins.

## Work package B: Parked scheduled runs no longer block later triggers

### Goal

After a run pauses or blocks, later triggers still happen. A trigger is skipped only when the previous run is actually executing or waiting for the user to answer.

### Current state

- `Overlap` in `core/protocol/src/tasks.rs:86` only has `Skip`.
- `core/engine/src/task_mode/schedule.rs:531` records `SkippedOverlap` whenever the last run is not terminal. `Paused` and `Blocked` are not terminal.
- In `desktop_schedules.rs`, a Host disconnect during a run pauses the Goal with reason `hostUnavailable`. One GUI disconnect therefore skips every later trigger for that task until the user resumes or cancels it by hand.
- Each run already creates its own session with a deterministic `requestId` (`schedule-thread-{run.id}`, around line 303 of `desktop_schedules.rs`). This matches T3's use of `scheduled-task:{id}:{time}:{trigger}` as the command ID and should stay.

### Target behavior

- When the next trigger is due and the last run is parked (paused or blocked, with no turn in progress and no interaction awaiting the user), Core ends it in a terminal state with the reason "replaced by the next run" and admits the new run as usual. The replaced run's session stays as it is, and the user can keep using it as an ordinary session.
- When the last run is executing, queued, waiting for user input, or waiting for sub-agents, the trigger is still skipped, as today.
- The trigger record (`TriggerDecision`) shows which run it replaced.
- At Core startup, a run still marked executing from the previous process but with nothing executing it must not keep showing as executing. It moves to a parked state with a reason (for example `coreRestarted`) and is then handled by the rule above.
- The GUI's scheduled task details show the reason on a replaced run and can open its session.

### Constraints

- At most one run per task executes at a time; this does not change.
- Persisted tasks and runs load unchanged. If the implementation adds a new `Overlap` value rather than adjusting how `Skip` decides, existing tasks must get the same fix; it cannot apply only to new tasks.
- This package does not handle triggering while the GUI is closed (that needs a machine-level scheduler) or task list read performance (another branch is changing task catalog observation).
- UI text uses existing i18n entries; no hard-coded Chinese.

### When to stop and ask

- Stop after the design note and wait for maintainer confirmation. The note must state which terminal state represents "replaced", whether `Skip` is adjusted directly or a new value is added, and how `coreRestarted` runs are handled.
- A parked run turns out to still hold resources such as a workspace, a process, or sub-agents, so ending it would have side effects.

### Done when

- Core tests cover: previous run paused → the next trigger ends it and admits a new run; previous run blocked → same; previous run executing or waiting for a user answer → `SkippedOverlap`; the replaced run's session can still be read and continued; after a Core restart, runs with nothing executing them no longer show as executing.
- Counterexample check: temporarily change the parked check back to "any non-terminal state" and confirm the replacement tests fail. Note it in the PR.
- Starting from an older task ledger, existing tasks follow the new rule on their next trigger.
- Docs: the run status and trigger outcome descriptions in `docs/api/core.md` are updated.

## Work package C: In-repo oxlint plugin

### Goal

Set up an in-repo lint plugin in `clients/gui` to carry design and engineering conventions that can be checked statically. The first batch delivers the plugin skeleton and two rules.

### Current state

- `clients/gui` uses `vite-plus` 1.4.0; lint runs through `vp lint` (oxlint), configured in the `lint` section of `clients/gui/vite.config.mts`. T3 uses the same version and mounts its in-repo plugin `oxlint-plugin-t3code` through `lint.jsPlugins`.
- `pnpm --dir clients/gui check` (`scripts/check.mjs`) runs `vp check --deny-warnings` only on changed files, locally and in CI. New rules therefore constrain only files touched by a change, and no baseline for existing code is needed.
- Design checks are currently standalone scripts such as `scripts/a11y-lint.mjs` and `scripts/design-rules.mjs`. The popup anchor check `popup-anchor-lint.mjs` (on the PR #10 branch) inspects CSS, which oxlint does not handle, so it stays a script and is not migrated.

### Target behavior

- The plugin directory, configuration mount, and rule tests follow the structure of T3's `oxlint-plugin-t3code` (MIT licensed). Ported code keeps its copyright notice, and `clients/gui/THIRD-PARTY-NOTICES.md` is updated.
- Rule 1: `require-suppression-reason`. Every `oxlint-disable`, `eslint-disable`, `@ts-expect-error`, and `@ts-ignore` must give a reason. Can be ported from T3.
- Rule 2: forbid `new ResizeObserver` directly in `renderer/src` and `packages/ui/src`; use a shared size-observation helper instead (it does not exist yet and needs to be added in `packages/ui`). There are about 28 direct calls today. T3's reason is that React commits state set inside a raw ResizeObserver callback one frame late, causing layout jumps, which is the same class of problem as our history-session jitter and popup drift. Before implementing, write a minimal test in our React 19.2 setup to confirm the effect. If it does not reproduce, skip this rule and instead pick an existing, statically checkable "must" rule from `clients/gui/design-system`, explaining the substitution in the PR.
- Each rule's message gives the reason and the replacement; where it corresponds to a design rule ID, the message includes the ID.
- Once a rule is enabled, the matching design rule text points to the lint rule instead of restating it.

### Constraints

- Rules apply only to changed files, keeping `check.mjs`'s current behavior. Do not bulk-edit existing violations or add suppressions for them.
- The plugin uses only the oxlint plugin API; no ESLint runtime.

### When to stop and ask

- `vite-plus` 1.4.0 cannot load an in-repo plugin in our repository, and the fix would require upgrading the toolchain or changing how `check.mjs` invokes it.

### Done when

- Each rule has tests for valid and invalid cases, wired into the existing `clients/gui` test commands.
- Counterexample check: deliberately add a violation to a changed file and confirm `pnpm --dir clients/gui check` fails and names the rule. Attach the output to the PR.
- The development guide under `docs/development/` explains how to add a rule.

## Out of scope

- Event sourcing and a full Outbox architecture. T3's central coordinator `Orchestrator.ts` is 12,839 lines; we borrow only the invariants above.
- Adding SQLite to the GUI. The source of truth stays with the executing side (Core). Core storage changes need their own review.
- A shared connection runtime for mobile (one reconnect owner per machine, transport state separate from data freshness). These constraints belong in the `remote-client` package section of the iOS remote v1 spec (`docs/development/ios-remote-v1-spec.md`, still under review) and are not implemented here.
- Reusing `scripts/ci-scope.py` for fast local checks, byte budgets for content injected into the model, and forbidding real-time waits in tests. These are clearly useful but rank below the three packages above.

## Sources

T3 Code source (pinned commit `f41518f3`):

- Command receipts and transactions: [`EventSink.ts`](https://github.com/pingdotgg/t3code/blob/f41518f3bc2672c419871c02a3c6728d0f627142/apps/server/src/orchestration-v2/EventSink.ts), [`CommandReceiptStore.ts`](https://github.com/pingdotgg/t3code/blob/f41518f3bc2672c419871c02a3c6728d0f627142/apps/server/src/orchestration-v2/CommandReceiptStore.ts)
- Settlement after process loss: [`EffectOutbox.ts`](https://github.com/pingdotgg/t3code/blob/f41518f3bc2672c419871c02a3c6728d0f627142/apps/server/src/orchestration-v2/EffectOutbox.ts) (`REPLAY_SAFE_EFFECT_TYPES_AFTER_PROCESS_LOSS`)
- Scheduled tasks: [`ScheduledTaskService.ts`](https://github.com/pingdotgg/t3code/blob/f41518f3bc2672c419871c02a3c6728d0f627142/apps/server/src/scheduledTasks/ScheduledTaskService.ts) (`runDueTasks`, startup settlement, `releaseStuckRun`), [`Schedule.ts`](https://github.com/pingdotgg/t3code/blob/f41518f3bc2672c419871c02a3c6728d0f627142/apps/server/src/scheduledTasks/Schedule.ts)
- Lint plugin: [`oxlint-plugin-t3code`](https://github.com/pingdotgg/t3code/tree/f41518f3bc2672c419871c02a3c6728d0f627142/oxlint-plugin-t3code), `lint.jsPlugins` in [`vite.config.ts`](https://github.com/pingdotgg/t3code/blob/f41518f3bc2672c419871c02a3c6728d0f627142/vite.config.ts)
