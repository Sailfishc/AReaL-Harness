"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, mkdir, rm, readdir, readFile, writeFile } = require("node:fs/promises");
const { join, dirname } = require("node:path");
const { tmpdir } = require("node:os");
const { WorktreeAdmission } = require("../app/src/core/worktree-admission.cjs");
const { checkoutRoot } = require("../packages/workspace-git");
const { ScheduleAdmission } = require("../app/src/core/schedule-admission.cjs");
const { randomUUID } = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const exec = promisify(execFile);
const git = (root, ...args) => exec("git", ["-C", root, ...args]);
async function repository(root) {
    await git(root, "init", "--initial-branch=main");
    await git(
        root,
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.invalid",
        "commit",
        "--allow-empty",
        "-m",
        "base",
    );
}

const idle = () => ({
    acceptingWork: true,
    activeTurns: [],
    resources: [],
    unresolvedTools: [],
    activeGoals: [],
    compactions: [],
    workgroups: [],
    activeTasks: 0,
    pendingQueueItems: 0,
});
async function fixture(t, status = idle()) {
    const directory = await mkdtemp(join(tmpdir(), "areal-author-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const root = join(directory, "repo");
    await mkdir(root);
    const threads = {
        first: { id: "first", sessionId: "first", parentThreadId: null },
        second: { id: "second", sessionId: "second", parentThreadId: null },
        fork: {
            id: "fork",
            sessionId: "fork",
            parentThreadId: null,
            conversation: { kind: "fork" },
        },
        child: { id: "child", sessionId: "first", parentThreadId: "first" },
        side: {
            id: "side",
            sessionId: "side",
            parentThreadId: null,
            conversation: { kind: "side" },
        },
    };
    const reads = [],
        dispatched = [],
        backend = { home: join(directory, "desktop") };
    const project = {
        id: "physical",
        root,
        client: {
            ready: true,
            request: async (method, params) => {
                reads.push({ method, params });
                if (method === "areal/server/status") return structuredClone(status);
                if (method === "areal/task/list") return { data: [], nextCursor: null };
                if (method === "thread/read") return { thread: threads[params.threadId] };
                assert.fail("unexpected read " + method);
            },
        },
    };
    let gate = new WorktreeAdmission(backend);
    const run = async (name, request) => {
        await gate.admit(project, name, { projectId: project.id, ...request });
        dispatched.push({ name, ...request });
    };
    return {
        backend,
        project,
        root,
        threads,
        reads,
        dispatched,
        status,
        run,
        restart() {
            gate = new WorktreeAdmission(backend);
        },
        gate: () => gate,
    };
}
const required = (error) =>
    error.code === "WORKTREE_REQUIRED" &&
    error.submissionUnknown === false &&
    error.outcome.kind === "noMutation";

test("barrier submissions grant the original checkout to one root session before either dispatches", async (t) => {
    const f = await fixture(t);
    const results = await Promise.allSettled([
        f.run("send", { threadId: "first" }),
        f.run("send", { threadId: "second" }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(
        results.filter((result) => result.status === "rejected" && required(result.reason)).length,
        1,
    );
    assert.deepEqual(f.dispatched, [{ name: "send", threadId: "first" }]);
    const files = await readdir(join(f.backend.home, "workspace-authors"));
    assert.equal(files.length, 1);
    const author = JSON.parse(
        await readFile(join(f.backend.home, "workspace-authors", files[0]), "utf8"),
    );
    assert.equal(author.sessionId, "first");
    assert.equal(author.root, f.root);
});

test("ownership survives idle, disconnect, manager restart and an owner's background processes", async (t) => {
    const f = await fixture(t);
    await f.run("send", { threadId: "first" });
    f.project.client.ready = false;
    f.restart();
    await assert.rejects(f.run("continue", { threadId: "second" }), required);
    f.project.client.ready = true;
    f.status.resources = [
        { threadId: "first", state: "running", id: "background" },
        { kind: "runtime", activeProcesses: 1, state: "running" },
    ];
    await assert.rejects(
        f.run("manage", { threadId: "second", operation: "processStart" }),
        required,
    );
    await f.run("manage", { threadId: "first", operation: "processWrite" });
    assert.equal(f.dispatched.length, 2);
});

test("independent service gate instances race to one immutable author record", async (t) => {
    const f = await fixture(t);
    const first = new WorktreeAdmission(f.backend),
        second = new WorktreeAdmission(f.backend);
    let waiting = 0,
        release;
    const barrier = new Promise((resolve) => {
        release = resolve;
    });
    const request = f.project.client.request;
    f.project.client.request = async (method, params) => {
        const value = await request(method, params);
        if (method === "areal/server/status") {
            if (++waiting === 2) release();
            await barrier;
        }
        return value;
    };
    const results = await Promise.allSettled([
        first.admit(f.project, "send", { threadId: "first" }),
        second.admit(f.project, "send", { threadId: "second" }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(
        results.filter((result) => result.status === "rejected" && required(result.reason)).length,
        1,
    );
    assert.equal((await readdir(join(f.backend.home, "workspace-authors"))).length, 1);
});

test("child Agents keep the parent's session author while independent Fork execution is blocked", async (t) => {
    const f = await fixture(t);
    await f.run("send", { threadId: "first" });
    await f.run("send", { threadId: "child" });
    await f.run("manage", { parentThreadId: "first", operation: "agentSpawn" });
    await assert.rejects(f.run("send", { threadId: "fork" }), required);
    await assert.rejects(
        f.run("manage", { parentThreadId: "fork", operation: "agentSpawn" }),
        required,
    );
    assert.equal(f.dispatched.length, 3);
});

test("every opaque thread mutation enters admission while reads and configuration do not reserve an author", async (t) => {
    const f = await fixture(t);
    await f.run("configure", { threadId: "second" });
    await f.run("open", { threadId: "second" });
    await f.run("manage", { operation: "processes", threadId: "second" });
    assert.equal(f.reads.length, 0);
    await f.run("send", { threadId: "first" });
    for (const [name, request] of [
        ["editMessage", { threadId: "second" }],
        ["continue", { threadId: "second" }],
        ["steer", { threadId: "second" }],
        ["respond", { threadId: "second" }],
        ["queueEdit", { threadId: "second", operation: "resume" }],
        ["manage", { threadId: "second", operation: "goalResume" }],
        ["manage", { threadId: "second", operation: "processStart" }],
        ["manage", { parentThreadId: "second", operation: "workgroupStart" }],
        ["manage", { threadId: "second", operation: "mcpExtensionCall" }],
        ["workspace", { threadId: "second", operation: "save" }],
        ["workspace", { threadId: "second", operation: "gitCommit" }],
    ])
        await assert.rejects(f.run(name, request), required, name + " " + request.operation);
    assert.equal(f.dispatched.length, 4);
});

test("cleanup, queue pause and readonly Side discussion remain possible for the non-owner", async (t) => {
    const f = await fixture(t);
    await f.run("send", { threadId: "first" });
    for (const operation of [
        "processTerminate",
        "executionCancel",
        "goalPause",
        "closeResources",
        "taskStopRun",
        "taskDelete",
    ])
        await f.run("manage", { threadId: "second", operation });
    await f.run("queueEdit", { threadId: "second", operation: "pause" });
    await f.run("stop", { threadId: "second" });
    await f.run("side", { threadId: "side", operation: "send" });
    await assert.rejects(
        f.run("manage", { threadId: "side", operation: "mcpExtensionCall" }),
        required,
    );
    await assert.rejects(f.run("workspace", { threadId: "side", operation: "save" }), required);
    assert.equal(f.dispatched.length, 10);
});

test("an unowned background process or unresolved cleanup blocks first authorship before dispatch", async (t) => {
    for (const resource of [
        { kind: "runtime", state: "running", activeProcesses: 1 },
        { threadId: "first", state: "cleanupUnknown" },
    ]) {
        const f = await fixture(t, { ...idle(), resources: [resource] });
        await assert.rejects(f.run("send", { threadId: "first" }), required);
        assert.deepEqual(f.dispatched, []);
    }
});

test("foreign active roots, queued work, tasks and uncertain effects block a new claim", async (t) => {
    for (const patch of [
        { activeTurns: [{ threadId: "second" }] },
        { resources: [{ threadId: "second", state: "running" }] },
        { pendingQueueItems: 1 },
        { activeTasks: 1 },
        { unresolvedTools: [{ threadId: "first" }] },
        { workgroups: [{ status: "running", cleanupConfirmed: false }] },
    ]) {
        const f = await fixture(t, { ...idle(), ...patch });
        await assert.rejects(f.run("send", { threadId: "first" }), required);
        assert.deepEqual(f.dispatched, []);
    }
});

test("matching active descendants can claim their existing root without changing files or their execution identity", async (t) => {
    const f = await fixture(t, {
        ...idle(),
        activeTurns: [{ threadId: "child" }],
        activeGoals: ["first"],
    });
    await f.run("send", { threadId: "first" });
    assert.equal(f.dispatched.length, 1);
    assert.equal(f.threads.child.sessionId, "first");
});

test("project-only writes, mixed-session targets and unavailable identity never fall back to the source", async (t) => {
    const f = await fixture(t);
    await assert.rejects(f.run("workspace", { operation: "save" }), required);
    await assert.rejects(f.run("send", {}), required);
    await assert.rejects(
        f.run("manage", { operation: "agentSpawn", threadId: "first", parentThreadId: "second" }),
        required,
    );
    await assert.rejects(f.run("send", { threadId: "missing" }), required);
    assert.deepEqual(f.dispatched, []);
});

test("scheduled task creation without dedicated admission is rejected before reads even when an author is supplied", async (t) => {
    const f = await fixture(t);
    for (const threadId of [undefined, "first", "second"])
        await assert.rejects(
            f.run("manage", { operation: "taskCreate", mode: "scheduled", threadId }),
            required,
        );
    assert.deepEqual(f.dispatched, []);
    assert.deepEqual(f.reads, []);
});

test("scheduled tasks use the dedicated admission boundary and authoritative mode instead of anchor session", async (t) => {
    const f = await fixture(t),
        admitted = [];
    f.backend.scheduleAdmission = {
        reserveDraft: async () => {},
        reserveCreate: async () => {},
        admitTask: async (project, taskId, operation) => {
            admitted.push({ project: project.id, taskId, operation });
        },
    };
    const request = f.project.client.request;
    f.project.client.request = (method, params) =>
        method === "areal/task/read"
            ? { id: params.taskId, mode: "scheduled" }
            : request(method, params);
    await f.run("manage", { operation: "taskDraftConfirm", threadId: "first" });
    await f.run("manage", { operation: "taskCreate", mode: "scheduled", threadId: "first" });
    await f.run("manage", {
        operation: "taskRunNow",
        taskId: "saved",
        threadId: "first",
        mode: "background",
    });
    assert.deepEqual(admitted, [{ project: "physical", taskId: "saved", operation: "taskRunNow" }]);
    assert.deepEqual(f.reads, []);
    f.backend.scheduleAdmission.admitTask = async () => {
        throw Object.assign(new Error("unsafe schedule"), { code: "WORKTREE_REQUIRED" });
    };
    await assert.rejects(
        f.run("manage", { operation: "taskResume", taskId: "saved", threadId: "first" }),
        { code: "WORKTREE_REQUIRED" },
    );
    assert.equal(f.dispatched.length, 3);
});

test("background task creation keeps the explicit anchored author", async (t) => {
    const f = await fixture(t);
    await assert.rejects(
        f.run("manage", { operation: "taskCreate", mode: "background" }),
        required,
    );
    await f.run("manage", { operation: "taskCreate", mode: "background", threadId: "first" });
    await assert.rejects(
        f.run("manage", { operation: "taskCreate", mode: "background", threadId: "second" }),
        required,
    );
    assert.equal(f.dispatched.length, 1);
});

test("Core-verified readonly task draft sends do not claim an ordinary writer", async (t) => {
    const f = await fixture(t);
    f.threads.first.desktop = {
        configuration: {
            options: {
                appendInstructions: "AREAL_TASK_DRAFT_V1\n",
                readOnly: true,
                toolAllowlist: [],
            },
        },
    };
    await f.run("send", { threadId: "first" });
    await f.run("manage", { operation: "taskDraftSend", threadId: "first" });
    await f.run("send", { threadId: "second" });
    f.threads.first.desktop.configuration.options.toolAllowlist = ["exec_command"];
    await assert.rejects(f.run("send", { threadId: "first" }), required);
});

test("checkout root and subdirectory projects race for one Git checkout author without changing cwd", async (t) => {
    const f = await fixture(t);
    await repository(f.root);
    const sub = join(f.root, "src");
    await mkdir(sub);
    const child = { ...f.project, id: "subproject", root: sub };
    let waiting = 0,
        release;
    const barrier = new Promise((resolve) => {
        release = resolve;
    });
    const request = f.project.client.request;
    f.project.client.request = async (method, params) => {
        const value = await request(method, params);
        if (method === "areal/server/status") {
            if (++waiting === 2) release();
            await barrier;
        }
        return value;
    };
    const results = await Promise.allSettled([
        new WorktreeAdmission(f.backend).admit(f.project, "send", { threadId: "first" }),
        new WorktreeAdmission(f.backend).admit(child, "send", { threadId: "second" }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(
        results.filter((result) => result.status === "rejected" && required(result.reason)).length,
        1,
    );
    assert.equal(child.root, sub);
    assert.equal((await readdir(join(f.backend.home, "workspace-authors"))).length, 1);
});

test("same checkout session may use another project cwd while linked Worktrees remain independent", async (t) => {
    const f = await fixture(t);
    await repository(f.root);
    const sub = join(f.root, "src"),
        linked = join(f.root, "..", "linked");
    await mkdir(sub);
    await git(f.root, "worktree", "add", "-b", "independent", linked);
    await f.run("send", { threadId: "first" });
    const gate = new WorktreeAdmission(f.backend);
    await gate.admit({ ...f.project, id: "subproject", root: sub }, "send", { threadId: "child" });
    await gate.admit({ ...f.project, id: "linked", root: linked }, "send", { threadId: "second" });
    assert.equal((await readdir(join(f.backend.home, "workspace-authors"))).length, 2);
});

test("first checkout author refuses an unknown peer host or its foreign background effects", async (t) => {
    const f = await fixture(t);
    await repository(f.root);
    const sub = join(f.root, "src");
    await mkdir(sub);
    const peer = { id: "peer", root: sub };
    f.backend.saved = [f.project, peer];
    await assert.rejects(f.run("send", { threadId: "first" }), required);
    peer.client = {
        ready: true,
        request: (method, params) =>
            method === "areal/server/status"
                ? { ...idle(), resources: [{ threadId: "second", state: "running" }] }
                : f.project.client.request(method, params),
    };
    await assert.rejects(f.run("send", { threadId: "first" }), required);
    peer.client.request = (method, params) =>
        method === "areal/server/status" ? idle() : f.project.client.request(method, params);
    await f.run("send", { threadId: "first" });
    assert.equal(f.dispatched.length, 1);
});

test("registered nested independent Git checkout is rejected before either first author can dispatch", async (t) => {
    const f = await fixture(t);
    await repository(f.root);
    const sub = join(f.root, "inner");
    await mkdir(sub);
    await repository(sub);
    const child = { ...f.project, id: "inner", root: sub };
    f.backend.saved = [f.project, child];
    f.status.resources = [{ threadId: "second", state: "running" }];
    for (const project of [f.project, child])
        await assert.rejects(
            new WorktreeAdmission(f.backend).admit(project, "send", { threadId: "first" }),
            required,
        );
    assert.deepEqual(f.dispatched, []);
    assert.equal(
        f.reads.some((read) => read.method === "areal/server/status"),
        false,
    );
});

test("later Git initialization in an owned directory cannot introduce a second overlapping checkout author", async (t) => {
    const f = await fixture(t);
    await f.run("send", { threadId: "first" });
    const sub = join(f.root, "inner");
    await mkdir(sub);
    await repository(sub);
    const child = { ...f.project, id: "inner", root: sub };
    f.backend.saved = [f.project, child];
    for (const project of [f.project, child])
        await assert.rejects(
            new WorktreeAdmission(f.backend).admit(project, "send", { threadId: "second" }),
            required,
        );
    assert.equal(f.dispatched.length, 1);
    assert.equal((await readdir(join(f.backend.home, "workspace-authors"))).length, 1);
});

test("registered overlapping non-Git directories fail closed but unrelated projects still execute", async (t) => {
    const f = await fixture(t);
    const sub = join(f.root, "src"),
        unrelated = join(f.root, "..", "other");
    await mkdir(sub);
    await mkdir(unrelated);
    const child = { ...f.project, id: "nested", root: sub };
    f.backend.saved = [
        f.project,
        child,
        { id: "other", root: unrelated },
        { id: "removed", root: join(unrelated, "..", "removed") },
    ];
    for (const project of [f.project, child])
        await assert.rejects(
            new WorktreeAdmission(f.backend).admit(project, "send", { threadId: "first" }),
            required,
        );
    await new WorktreeAdmission(f.backend).admit(
        { ...f.project, id: "other", root: unrelated },
        "send",
        { threadId: "second" },
    );
});

test("unregistered nested non-Git projects racing cannot publish two overlapping authors", async (t) => {
    const f = await fixture(t);
    const sub = join(f.root, "src");
    await mkdir(sub);
    const child = { ...f.project, id: "nested", root: sub };
    const results = await Promise.allSettled([
        new WorktreeAdmission(f.backend).admit(f.project, "send", { threadId: "first" }),
        new WorktreeAdmission(f.backend).admit(child, "send", { threadId: "second" }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(
        results.filter((result) => result.status === "rejected" && required(result.reason)).length,
        1,
    );
    assert.equal((await readdir(join(f.backend.home, "workspace-authors"))).length, 1);
});

test("legacy subdirectory claim is retained and blocks a newly discovered containing Git checkout", async (t) => {
    const f = await fixture(t);
    const sub = join(f.root, "src");
    await mkdir(sub);
    await new WorktreeAdmission(f.backend).admit(
        { ...f.project, id: "nested", root: sub },
        "send",
        { threadId: "first" },
    );
    const directory = join(f.backend.home, "workspace-authors");
    const [file] = await readdir(directory),
        before = await readFile(join(directory, file), "utf8");
    await repository(f.root);
    await assert.rejects(f.run("send", { threadId: "first" }), required);
    assert.equal(await readFile(join(directory, file), "utf8"), before);
});

test("checkout identity ignores inherited Git redirection and fails closed for a corrupt Git marker", async (t) => {
    const f = await fixture(t);
    await repository(f.root);
    const sub = join(f.root, "src");
    await mkdir(sub);
    const old = { GIT_DIR: process.env.GIT_DIR, GIT_WORK_TREE: process.env.GIT_WORK_TREE };
    try {
        process.env.GIT_DIR = join(f.root, "missing-git");
        process.env.GIT_WORK_TREE = join(f.root, "missing-tree");
        assert.equal(await checkoutRoot(sub), f.root);
    } finally {
        for (const [key, value] of Object.entries(old)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
    const other = join(f.root, "..", "corrupt");
    await mkdir(other);
    const { writeFile } = require("node:fs/promises");
    await writeFile(join(other, ".git"), "gitdir: /missing-areal-test-git\n");
    await assert.rejects(
        new WorktreeAdmission(f.backend).admit({ ...f.project, root: other }, "send", {
            threadId: "first",
        }),
        required,
    );
});

test("task draft confirmation requires dedicated schedule admission before dispatch", async (t) => {
    const f = await fixture(t);
    await assert.rejects(
        f.run("manage", { operation: "taskDraftConfirm", threadId: "first" }),
        required,
    );
    assert.deepEqual(f.dispatched, []);
    assert.deepEqual(f.reads, []);
});

test("corrupt durable owner record rejects instead of being silently replaced", async (t) => {
    const f = await fixture(t);
    await f.run("send", { threadId: "first" });
    const directory = join(f.backend.home, "workspace-authors"),
        [file] = await readdir(directory);
    const { writeFile } = require("node:fs/promises");
    await writeFile(join(directory, file), "{");
    f.restart();
    await assert.rejects(f.run("send", { threadId: "first" }), required);
    assert.equal(f.dispatched.length, 1);
});

test("failed authoritative read stays a pre-dispatch Worktree requirement", async (t) => {
    const f = await fixture(t);
    f.project.client.request = async () => {
        throw new Error("transport interrupted");
    };
    await assert.rejects(f.run("send", { threadId: "first" }), required);
    assert.deepEqual(f.dispatched, []);
});

test("sleeping prepared legacy schedule blocks ordinary authors even at activeTasks zero and after author restart", async (t) => {
    const f = await fixture(t),
        tasks = [];
    const request = f.project.client.request;
    f.project.client.request = (method, params) =>
        method === "areal/task/list"
            ? { data: structuredClone(tasks), nextCursor: null }
            : request(method, params);
    await f.run("send", { threadId: "first" });
    tasks.push({
        id: "legacy",
        mode: "scheduled",
        threadId: "second",
        cancelled: false,
        paused: true,
        nextRunAt: 9999999999,
        runs: [{ preparation: { persisted: true } }],
    });
    assert.equal(f.status.activeTasks, 0);
    f.restart();
    await assert.rejects(f.run("send", { threadId: "first" }), required);
    assert.equal(f.dispatched.length, 1);
    tasks[0].cancelled = true;
    await f.run("send", { threadId: "first" });
});

test("task catalog follows every authoritative page and rejects unknown or nonadvancing pagination", async (t) => {
    const f = await fixture(t),
        pages = [];
    const request = f.project.client.request;
    f.project.client.request = (method, params) => {
        if (method !== "areal/task/list") return request(method, params);
        pages.push(params.after);
        return params.after
            ? { data: [{ id: "b", mode: "scheduled", cancelled: false }], nextCursor: null }
            : { data: [{ id: "a", mode: "foreground", cancelled: false }], nextCursor: "a" };
    };
    await assert.rejects(f.run("send", { threadId: "first" }), required);
    assert.deepEqual(pages, [undefined, "a"]);
    for (const reply of [
        { data: [] },
        { data: [], nextCursor: "a" },
        { data: [], nextCursor: null, hasMore: true },
    ]) {
        f.project.client.request = (method, params) =>
            method === "areal/task/list" ? reply : request(method, params);
        await assert.rejects(f.run("send", { threadId: "first" }), required);
    }
    assert.deepEqual(f.dispatched, []);
});

test("verified dedicated schedule family retains its exact bound Task and rejects a second or foreign schedule", async (t) => {
    const f = await fixture(t),
        tasks = [];
    const request = f.project.client.request,
        token = "schedule:verified";
    f.backend.scheduleAdmission = {
        read: async () => ({ token, taskId: "owned", anchorThreadId: "first" }),
    };
    f.project.client.request = (method, params) =>
        method === "areal/task/list" ? { data: tasks, nextCursor: null } : request(method, params);
    await f.gate().claim(f.project, token);
    tasks.push({ id: "owned", mode: "scheduled", cancelled: false, threadId: "first" });
    f.restart();
    await f.gate().claim(f.project, token);
    tasks.push({ id: "other", mode: "scheduled", cancelled: false, threadId: "second" });
    await assert.rejects(f.gate().claim(f.project, token), required);
});

async function scheduledExecution(t) {
    const f = await fixture(t),
        allocation = randomUUID(),
        tasks = [],
        interactions = [];
    f.project.id = "a".repeat(24);
    f.backend.saved = [{ ...f.project, projectless: true, projectlessRequestId: allocation }];
    f.backend.projectless = { records: { [allocation]: { root: f.root, existing: false } } };
    f.backend.save = async (file, value) => {
        const target = join(f.backend.home, file);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, JSON.stringify(value));
    };
    f.threads.first.cwd = f.root;
    const request = f.project.client.request;
    f.project.client.request = async (method, params) => {
        if (method === "areal/task/list") return { data: structuredClone(tasks), nextCursor: null };
        if (method === "areal/task/read")
            return structuredClone(tasks.find((task) => task.id === params.taskId));
        if (method === "areal/task/run/read")
            return structuredClone(
                tasks
                    .find((task) => task.id === params.taskId)
                    ?.runs.find((run) => run.id === params.runId),
            );
        if (method === "areal/interaction/list")
            return {
                revision: 1,
                data: structuredClone(
                    interactions.filter((item) => item.threadId === params.threadId),
                ),
            };
        return request(method, params);
    };
    f.backend.scheduleAdmission = new ScheduleAdmission(f.backend);
    f.backend.worktreeAdmission = f.gate();
    f.project.model = {
        state: { interactions: {} },
        setInteractions(threadId, value) {
            this.state.interactions[threadId] = structuredClone(value);
        },
    };
    const reservation = await f.backend.scheduleAdmission.reserveCreate(
        f.project,
        randomUUID(),
        "first",
    );
    const run = {
        id: "run-id",
        threadId: "execution",
        goalId: "goal-id",
        status: "waitingForInput",
        workers: [],
    };
    const task = {
        id: "task-id",
        mode: "scheduled",
        threadId: "first",
        cancelled: false,
        paused: false,
        runs: [run],
    };
    tasks.push(task);
    f.threads.execution = {
        id: "execution",
        sessionId: "execution",
        cwd: f.root,
        source: "nativeTaskAgent",
        goals: {
            goal: {
                id: "goal-id",
                threadId: "execution",
                status: "active",
                activeTurnId: "turn-id",
            },
        },
        turns: [{ id: "turn-id", status: "inProgress", goal: { goalId: "goal-id" }, items: [] }],
    };
    await f.backend.scheduleAdmission.bind(f.project, task);
    return { ...f, tasks, task, executionRun: run, interactions, reservation };
}

test("scheduled execution replies and continuation use verified Run ownership rather than renderer tokens", async (t) => {
    const f = await scheduledExecution(t);
    for (const [kind, response] of [
        ["approval", { decision: "allowOnce" }],
        ["approval", { decision: "deny" }],
        ["question", { answers: { answer: "yes" } }],
    ]) {
        const requestId = `${kind}-${f.dispatched.length}`;
        f.interactions.splice(0, f.interactions.length, {
            requestId,
            threadId: "execution",
            turnId: "turn-id",
            callId: "call-id",
            kind,
            questions:
                kind === "question"
                    ? [{ id: "answer", title: "Proceed?", options: [], allowFreeText: true }]
                    : [],
            status: "pending",
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
        });
        await f.run("respond", {
            threadId: "execution",
            requestId,
            ...response,
            token: "untrusted",
        });
    }
    await f.run("continue", { threadId: "execution", expectedTurnId: "turn-id" });
    await assert.rejects(
        f.run("respond", { threadId: "execution", requestId: "foreign" }),
        required,
    );
    await assert.rejects(
        f.run("continue", { threadId: "execution", expectedTurnId: "old-turn" }),
        required,
    );
    f.interactions[0].expiresAt = Math.floor(Date.now() / 1000) - 1;
    await assert.rejects(
        f.run("respond", {
            threadId: "execution",
            requestId: f.interactions[0].requestId,
            answers: { answer: "yes" },
        }),
        required,
    );
    await assert.rejects(
        f.run("continue", {
            threadId: "second",
            expectedTurnId: "turn-id",
            token: f.reservation.token,
        }),
        required,
    );
    f.task.cancelled = true;
    await assert.rejects(
        f.run("continue", { threadId: "execution", expectedTurnId: "turn-id" }),
        required,
    );
    assert.equal(f.dispatched.length, 4);
});
