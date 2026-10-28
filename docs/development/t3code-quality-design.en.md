[中文](t3code-quality-design.md) | **English**

# Learning from T3 Code: testability, reliability, and development efficiency

## Status and design conclusion

This is a proposal for review, extending work packages A/B/C in the existing admission-record, scheduled-task, and repository-lint specification. Packages D–I below are candidates, not implemented or accepted capabilities.

Source comparison: T3 Code `93a9e079b107a13b0c312920b917b5f61a8f720c`; AReaL-Harness HEAD `2d3c4b14183f54cbee8ba467cd023c94ab5f6005` plus the working tree inspected during analysis. Concurrent AReaL changes affect admission recovery, task UI, and context handling. Observations describe inspected mechanisms and do not establish completion of those efforts. Evidence consists of local source and test inspection; neither product was run and no speed or failure-rate improvement was measured.

The main opportunity is to turn failures into repeatable inputs, controlled ordering, and independently checkable outcomes. Reuse Rust Core/Runtime, existing HTTP model fixtures, Desktop projections, and the test manifest. Adopting Effect, SQLite event sourcing, or a central Orchestrator is not a prerequisite.

| Package | Added value | First slice | Suggested order |
| --- | --- | --- | --- |
| D. Provider protocol replay | Reproduce stream, chunk, and tool-call failures offline | One real HTTP adapter and two existing failure scenarios | First batch |
| E. Controlled ordering | Enter a race window deliberately | Milestones for D's cancellation case and one time-policy test | Alongside D |
| F. Projection consistency acceptance | Detect incorrect state after reconnect and history loading | Missing-frame and stale-response cases on one Desktop observation path | Second batch |
| G. Change-scoped local checks | Get relevant feedback sooner during iteration | Reuse CI scope and GUI manifest, explain selection | Independent first-batch work |
| H. Representative data fixtures | Share complex data shapes between development and acceptance | Extend synthetic history-compat samples | Second batch |
| I. Model-input size baseline | Make tool and system-context growth visible | Measure default static instructions and tool schemas separately | Later small slice |

D/F/H are additions. E/G/I develop the original specification's deferred suggestions about time control, local checks, and context budgets. F relates to the mobile connection proposal but covers observation acceptance only; that separate effort retains ownership of shared connection runtime design.

## D. Replay protocols at the real Provider adapter boundary

**T3 evidence.** `packages/provider-testing/src/replayTranscript.ts` parses metadata-bearing NDJSON and materializes workspace placeholders. `replayGate.ts` provides `waitForReached/release`. `ProviderReplayHarness.ts` connects replay adapters to real orchestration and persistence services. Recovery tests also carry persisted state into later runtimes. See the [transcript reader](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/packages/provider-testing/src/replayTranscript.ts), [gates](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/packages/provider-testing/src/replayGate.ts), and [recovery tests](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/apps/server/src/orchestration-v2/testkit/OrchestratorReplayRecovery.integration.test.ts).

**Existing foundation.** [http_model.rs](../../core/engine/tests/http_model.rs) already covers real HTTP adaptation, chunks, transport loss after a finish marker, sampling, and capabilities. [solve_only_http.rs](../../core/engine/tests/support/solve_only_http.rs) isolates request purposes. [history-smoke.mjs](../../clients/gui/scripts/history-smoke.mjs) uses real Core/Runtime and a local SSE model. Scenarios are primarily expressed through per-test server code; the opportunity is to retain shared protocol failures as reusable input assets.

**Minimal design.** Extend HTTP test support under `core/engine/tests/support/`, initially for one selected protocol. Record three actions: assert necessary semantic fields in outbound requests, send specified inbound bytes, and wait or disconnect at a named milestone. Metadata identifies protocol version, request purpose, synthetic or sanitized origin, and expected terminal state. Sanitize before committing fixtures; do not add automatic production traffic recording.

The test path is “replay HTTP server → production HttpModel/decoder → Engine → real temporary storage,” adding real Runtime when tool effects are under test. Only the HTTP server is substituted; recovery, persistence, and settlement remain production implementations. Preserve raw byte boundaries instead of converting input into already-correct model events. Assert semantic outcomes rather than complete internal logs.

**Acceptance.** Start with existing “text followed by an error in one HTTP chunk” and “transport failure after finish_reason” cases, checking retained text, failure type, and whether tools may execute. Add an integration case that disconnects after a tool result is persisted, then verify workspace effect count, durable result, and the recovered Turn. Restart uses a new Engine/process with the same isolated data directory. Complete and truncated recordings have explicit expectations; an incomplete replay cannot count as normal completion. In an isolated copy, releasing tools too early or dropping observed text must make the relevant assertions fail.

**Cost and limits.** Fixtures require maintenance as provider protocols change. Prove that two cases can share the format before extending it to GUI runners; do not build a cross-language execution framework upfront. Replay establishes protocol and recovery contracts, while live-provider compatibility needs separate validation. Package A continues to own creation-request admission and the conditions for retrying UNKNOWN outcomes.

## E. Control ordering with milestones and policy with virtual time

**T3 evidence.** [DeterministicRuntime.ts](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/apps/server/src/orchestration-v2/testkit/DeterministicRuntime.ts) installs TestClock and seeded randomness; replay gates distinguish arrival from release. [ThreadSettlementService.test.ts](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/apps/server/src/orchestration-v2/ThreadSettlementService.test.ts) uses Deferred and TestClock to control races. Polling helpers also exist in T3, so this does not establish that every test is deterministic.

**Existing foundation.** [model_load.rs](../../core/engine/tests/model_load.rs) already uses `start_paused` and `tokio::time::advance`; `http_model.rs` waits for Activity through Notify before releasing a terminal response. [model_timeouts.rs](../../core/engine/tests/model_timeouts.rs) includes real HTTP waits. [desktop-projection-transport.test.mjs](../../clients/gui/scripts/desktop-projection-transport.test.mjs) polls for socket and history-release milestones.

**Minimal design.** Let the owning fixture expose only needed observable milestones such as `requestObserved`, `frameDelivered`, or `resultPersisted`. Reuse paused Tokio time for policy tests and message/notification waits for socket integration. A persistence milestone must follow completed persistence; a model server sending a response does not prove Core saved it. Prefer existing events and test dependency boundaries; any additional test hook belongs only in test builds.

**Acceptance.** For one cancellation scenario, enforce “request observed → cancel → release late response,” then assert that the late result cannot revive a finished Turn and resources are released. For one pure time-policy test, advance just before and after the deadline only after the timer is registered, verifying the expected single transition. Event waits retain an overall failure deadline. Bypassing the late-result guard or moving the timeout start incorrectly must fail the corresponding test.

**Cost and limits.** Page clocks, Main timers, Core time, and system I/O do not share one virtual clock. Keep a small real-time HTTP timeout suite. Migrate tests as their owners change; avoid a system-wide Clock abstraction or a blanket ban on every sleep. Report comparable duration, first-run failures, and retries before and after migration rather than assuming a speedup.

## F. Complete snapshot, delta, and reconnect consistency acceptance

**T3 evidence.** [subscribeBeforeSnapshot.ts](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/apps/server/src/utils/subscribeBeforeSnapshot.ts) either reads the snapshot then subscribes inside a shared mutex, or subscribes first when no shared lock exists. Its [tests](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/apps/server/src/utils/subscribeBeforeSnapshot.test.ts) insert changes into the read window. [shell-sync.test.ts](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/packages/client-runtime/src/state/shell-sync.test.ts) covers stale asynchronous saves, authoritative resets, and enrichment conflicts. Borrow executable invariants, not ordering inferred from a function name.

**Existing foundation.** [state-projection.cjs](../../clients/gui/packages/workbench/client/state-projection.cjs) validates stream, sequence, and delta base; duplicate/older sequences return existing state. Desktop transport tests already cover backpressure coalescing, command-response ordering, and isolated history release. [bounded-history-client.test.mjs](../../clients/gui/scripts/bounded-history-client.test.mjs) and [history-reobserve.test.mjs](../../clients/gui/scripts/history-reobserve.test.mjs) cover history observation. Start by checking the coverage matrix and extend existing assertions where sufficient.

**Minimal design.** Control three boundaries in existing Desktop observation tests: subscription/snapshot handoff, projection delivery, and completion of old history requests. Compare public project/Thread identity, Turn state, item content, and continued history loading. Expectations come from declared business outcomes or independent authoritative reads, not entirely from the encoder under test.

| Injected scenario | Required result |
| --- | --- |
| Change during initial snapshot/observation handoff | Present in either the snapshot or a later notification, never silently omitted |
| Duplicate or old frame within one stream | No repeated semantic application or rollback |
| Delta without its base | Reject the invalid delta; the owning connection recovery path obtains a complete baseline |
| Old response arrives after a new connection | It cannot overwrite new state; a new stream uses a new reader/baseline |
| History load/acquire completes after release | The released view owns no resources; other clients remain readable |

**Acceptance.** Fill uncovered cases first, then run missing-frame recovery across a real local socket and compare final public state with an authoritative read. Assert that user writes were not resent. Removing base validation or permitting old-connection state writes must fail the relevant case. Change production code only when a test demonstrates a defect, explaining the recovery action against its actual contract.

**Cost and limits.** Whether sequences may reset depends on stream/connection identity; do not copy T3's lower-sequence authoritative-reset rules directly. Start with Desktop, then add Remote-specific transport and permission acceptance when reusing semantic cases. Local socket success does not establish mobile or Relay acceptance.

## G. Change-scoped local checks sharing CI selection

**T3 evidence.** [check-changed.ts](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/scripts/check-changed.ts) reuses CI's `decide/readWorkspace`, includes uncommitted/untracked paths, typechecks affected packages and dependents, runs adjacent tests, and lists work left to CI. Its passing cache also checks that inputs did not change during execution.

**Existing foundation.** [ci-scope.py](../../scripts/ci-scope.py) selects broad GUI/release scope; [test-manifest.mjs](../../clients/gui/scripts/test-manifest.mjs) already selects areas and falls back broadly for unmapped paths; [check.mjs](../../clients/gui/scripts/check.mjs) performs changed-file static checks. [Makefile](../../Makefile) provides the more comprehensive `ci-preflight`. The missing slice is an iteration-friendly check plan, not another release gate.

**Minimal design.** Add a thin local entry point, provisionally `make check-changed CI_BASE=<ref>` (not currently available). Resolve merge-base once and include committed, staged, unstaged, untracked, deleted, and renamed paths. Invoke existing scope rules and the manifest, explaining selected commands, matching paths, prerequisites, and uncovered work. GUI area selection stays in the manifest. Shared Core/schema/toolchain changes select broad coverage; do not infer a detailed Rust dependency graph initially.

The first version selects and executes without caching an entire passing run. Independent static steps may run concurrently after inputs are prepared; steps sharing build outputs or a fixed deployment slot follow dependency order. Existing preflight and CI obligations continue to apply.

**Acceptance.** In temporary Git repositories, cover source, schema, lockfile, runner, deletion, rename, untracked, and unknown paths. The same path input must produce the same applicability at local and CI entry points. Shared schema changes include consumers; unknown code paths cannot mean “no tests needed.” Missing prerequisites fail explicitly or remain unexecuted, never passing. Input changes during execution invalidate the evidence. Omitting a shared-path mapping must fail a selection-contract test.

**Cost and limits.** Extend existing owners' rules rather than introducing a second whitelist. Consider caching only after selection correctness and measured duration justify it; keys would need sources, lockfiles, tools, configuration, and artifact identity rather than HEAD alone. Compare fast-check and preflight duration on the same change and retain their distinct coverage reports.

## H. Reuse representative history in development and acceptance

**T3 evidence.** [migrate-dev-db.ts](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/apps/server/scripts/migrate-dev-db.ts) reads an isolated snapshot from a read-only source, selects stopped Thread families, clears pending work/auth sessions, migrates, and prunes. Its [tests](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/apps/server/scripts/migrate-dev-db.test.ts) cover source/destination isolation and old-data upgrades. The benefit is bringing realistic data shapes into development.

**Existing foundation.** [history-copy-smoke.mjs](../../clients/gui/scripts/history-copy-smoke.mjs) supports synthetic fixtures and explicit local sources, checks idle/terminal state and absence of queued or managed execution, verifies source hashes, and rejects model calls during observation. Fixed artifact identity and isolated directories are already documented in the [testing guide](testing.en.md).

**Minimal design.** Extend `scripts/fixtures/history-compat` and its runner with compact synthetic profiles for long/paged history, fork/subagent relationships, and failed/interrupted terminal states. Each profile declares format version, semantic expectations, and source category. Keep migration samples in their old format rather than saving them with the current version first. Development preview and corresponding smoke tests consume the same samples; extract shared loading only when a second consumer exists.

Read-only history profiles retain existing idle restrictions. Crash, pending-admission, and paused-Goal data belong to D/F recovery fixtures with dedicated acceptance paths. Do not convert active states into success merely to load them. Real local copies still require an explicit source; the first slice adds no automatic copying of user directories at startup.

**Acceptance.** Current Core must read old-format titles, Thread relationships, original content, and further history pages correctly. Browsing causes zero model requests and leaves source hashes unchanged. Use the real Renderer to open long history and branches. Tie each profile to an invariant; removing its compatibility branch or breaking history references must fail that test.

**Cost and limits.** Synthetic samples cannot prove every real upgrade works. Retain explicit local-copy and package acceptance. Measure reduced manual setup and repeatable loading, not fixture count.

## I. Track static model-input size by component

**T3 evidence.** [AgentContextBudget.test.ts](https://github.com/pingdotgg/t3code/blob/93a9e079b107a13b0c312920b917b5f61a8f720c/apps/server/src/provider/AgentContextBudget.test.ts) measures UTF-8 bytes from production instruction builders and registered model-visible tool fields against a versioned baseline.

**Existing foundation.** [request_budget.rs](../../core/engine/src/model/request_budget.rs) already enforces request/media byte limits; [context.rs](../../core/engine/tests/context.rs) covers compaction and token limits. `http_model.rs` asserts actual instruction placement and tool-schema stability. Runtime oversize protection and default static-input growth address different problems.

**Minimal design.** Use existing HTTP request capture to measure production-assembled default system instructions, built-in tool `name/description/parameters`, and fixed environment text separately. Distinguish supported protocols/configurations, beginning with the default configuration only. User history, user Skills content, dynamic retrieval, and media are separate from the fixed baseline. Store a reviewable baseline as test data and report component deltas and their sources.

**Acceptance.** Unchanged input measures consistently. Adding static instructions or tool descriptions reports growth in the appropriate component without automatically accepting it. Removing a tool description must also be visible in measurement. Intentional increases are explained with their necessity and default-input impact in the same change. UTF-8 bytes are a deterministic growth signal, not an unverified estimate of tokens, cost, or success rate.

**Cost and limits.** The check does not automatically delete instructions, truncate tools, or change production budgets. Any subsequent Agent behavior change follows the [agent improvement method](agent-improvement.en.md). Avoid exact goldens for all dynamic requests and do not adopt T3's numeric allowances.

## Delivery order and stopping conditions

Start with D's two replay scenarios and E's milestones; G's selection plan can proceed independently. Follow with F/H based on demonstrated gaps. I is a small independent check that can move earlier when tool/prompt changes are frequent. Each package delivers its own diff and acceptance evidence without requiring a unified testing platform.

| Goal | Evidence to retain | What it does not establish |
| --- | --- | --- |
| Testability | Fixed input, precise failure location, correct implementation passes and targeted error fails | Complete provider coverage |
| Reliability | Correct recovered public state, correct effect count, isolation of old responses | Release reliability from unit tests alone |
| Development efficiency | Comparable first-run duration, setup steps, first-run failures/retries, selected scope | Fewer tests necessarily being better or faster |

Use existing runners: focused `cargo test --locked -p areal-engine --test <target>` for Rust; `node --test clients/gui/scripts/desktop-projection-transport.test.mjs` for projection transport; `pnpm --dir clients/gui test:history-compat` with matching fixed artifacts for history compatibility. Register additions in existing runners/manifests. Report GUI, Core, live-provider, native-desktop, and package evidence separately.

This design ends at candidate decisions and acceptance contracts. Recheck concurrent implementation before starting each package and reuse coverage already delivered. Expand into production fixes only when concrete tests demonstrate a contract defect; update existing protocol, persistence, or UI documentation with those changes.
