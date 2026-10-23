"use strict";
const { mkdir, readFile, readdir, writeFile, realpath, lstat } = require("node:fs/promises");
const { join, isAbsolute, resolve, parse, relative } = require("node:path");
const { createHash } = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const git = require("@areal/workspace-git");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const unavailable = (message) =>
    Object.assign(new Error(message), {
        code: "WORKTREE_BINDING_UNAVAILABLE",
        submissionUnknown: true,
    });
const signature = (request) =>
    JSON.parse(
        JSON.stringify(
            Object.fromEntries(
                ["worktree", "model", "parameters", "options", "profile", "browserEnabled"]
                    .filter((key) => request[key] !== undefined)
                    .map((key) => [key, request[key]]),
            ),
        ),
    );

/** 每个执行目录保留独立服务和日志，逻辑项目只聚合可重建的展示。 */
class CoreWorktrees {
    constructor(backend) {
        this.backend = backend;
        this.records = new Map();
        this.queues = new Map();
        this.threadOwners = new Map();
    }
    key(id) {
        if (typeof id !== "string" || !uuid.test(id)) throw new Error("无效工作树请求标识");
        return join("worktree-requests", id + ".json");
    }
    async init() {
        let names;
        try {
            names = await readdir(join(this.backend.home, "worktree-requests"));
        } catch (error) {
            if (error.code !== "ENOENT") throw error;
            names = [];
        }
        for (const name of names) {
            if (!uuid.test(name.replace(/\.json$/, "")) || !name.endsWith(".json")) continue;
            const value = JSON.parse(
                await readFile(join(this.backend.home, "worktree-requests", name), "utf8"),
            );
            if (value.requestId !== name.slice(0, -5) || typeof value.projectId !== "string")
                throw new Error("工作树创建日志无效");
            this.records.set(value.requestId, value);
        }
        const directory = join(this.backend.home, "thread-owners");
        await mkdir(directory, { recursive: true, mode: 0o700 });
        for (const name of await readdir(directory)) {
            if (!/^[a-f0-9]{24}\.json$/.test(name)) continue;
            const owner = this.backend.saved.find((project) => project.id === name.slice(0, -5));
            if (!owner) continue;
            const ids = JSON.parse(await readFile(join(directory, name), "utf8"));
            if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || !id))
                throw new Error("线程归属索引无效");
            for (const id of ids) {
                if (this.threadOwners.has(id) && this.threadOwners.get(id) !== owner.id)
                    throw new Error("线程归属索引冲突");
                this.threadOwners.set(id, owner.id);
            }
        }
    }
    async observeProject(project) {
        let changed = false;
        for (const id of [
            ...Object.keys(project.model.state.threads),
            ...(project.summaries ?? []).map((thread) => thread.id),
        ]) {
            const owner = this.threadOwners.get(id);
            if (owner && owner !== project.id) throw unavailable("线程执行归属冲突");
            if (!owner) {
                this.threadOwners.set(id, project.id);
                changed = true;
            }
        }
        if (!changed) return;
        await this.backend.save(
            join("thread-owners", project.id + ".json"),
            [...this.threadOwners].filter(([, owner]) => owner === project.id).map(([id]) => id),
        );
    }
    logicalId(project) {
        return project.logicalProjectId ?? project.id;
    }
    owners(logicalId) {
        return this.backend.saved.filter(
            (p) => p.id === logicalId || p.logicalProjectId === logicalId,
        );
    }
    executionProjectId(logicalId, threadId) {
        const b = this.backend,
            requested = b.saved.find((p) => p.id === logicalId);
        if (!requested) throw new Error("未知工作区");
        const logical = requested.logicalProjectId ?? logicalId,
            matches = new Set();
        const indexed = this.threadOwners.get(threadId);
        if (indexed) {
            const owner = b.saved.find((project) => project.id === indexed);
            if (!owner || this.logicalId(owner) !== logical)
                throw new Error("会话不属于此逻辑项目");
            matches.add(indexed);
        }
        for (const value of this.records.values())
            if (
                value.projectId === logical &&
                value.threadId === threadId &&
                value.executionProjectId
            )
                matches.add(value.executionProjectId);
        for (const owner of b.saved) {
            const live = b.projects.get(owner.id),
                cached = b.library.value.projects[owner.id]?.navigationSummaries ?? [];
            if (
                live?.model.state.threads?.[threadId] ||
                live?.summaries?.some((t) => t.id === threadId) ||
                cached.some((t) => t.id === threadId)
            ) {
                if (this.logicalId(owner) !== logical) throw new Error("会话不属于此逻辑项目");
                matches.add(owner.id);
            }
        }
        if (matches.size > 1) throw unavailable("会话执行归属不唯一，请核对原工作树");
        if (matches.size === 1) return [...matches][0];
        if (this.owners(logical).length === 1) return logical;
        throw unavailable("会话执行归属尚未确认，请先重新连接原项目");
    }
    async resolveRequest(name, request) {
        if (!request?.projectId || name === "library" || name === "create") {
            if (
                name === "create" &&
                this.backend.saved.find((p) => p.id === request.projectId)?.logicalProjectId
            )
                throw new Error("请从逻辑项目创建会话，不能绕过工作树准入");
            return request;
        }
        const original = this.backend.saved.find((p) => p.id === request.projectId);
        if (!original) return request;
        const logicalId = this.logicalId(original);
        if (request.logicalProjectId !== undefined && request.logicalProjectId !== logicalId)
            throw new Error("逻辑项目归属不匹配");
        const targets = [
            request.threadId,
            request.sourceThreadId,
            request.parentThreadId,
            ...(Array.isArray(request.threadIds) ? request.threadIds : []),
        ].filter(Boolean);
        const owners = new Set(targets.map((id) => this.executionProjectId(logicalId, id)));
        if (request.taskId) {
            const executionStarting =
                name === "manage" &&
                ["taskRunNow", "taskResumeRun", "taskReply", "taskResume", "taskUpdate"].includes(
                    request.operation,
                );
            const target = await this.backend.taskWorkspaceOwners.target(
                logicalId,
                request.taskId,
                { execution: executionStarting },
            );
            owners.add(target.projectId);
            if (request.threadId && request.threadId !== target.threadId)
                throw unavailable("任务执行会话归属不匹配");
            if (target.threadId) request = { ...request, threadId: target.threadId };
            else if (executionStarting)
                throw unavailable("任务没有可核对的执行会话，请先选择独立工作树会话");
            if (
                executionStarting &&
                !["foreground", "background", "scheduled"].includes(target.mode)
            )
                throw unavailable("此任务的独立执行工作区尚未确认，未启动或恢复安排");
        }
        const operation = this.records.get(request.requestId);
        if (operation && operation.projectId !== logicalId)
            throw new Error("原请求不属于此逻辑项目");
        if (
            request.requestId &&
            !(name === "workspace" && request.operation.startsWith("worktree"))
        ) {
            for (const owner of this.owners(logicalId)) {
                const live =
                    this.backend.projects.get(owner.id) ??
                    (await this.backend.loadProjectJournal?.(owner.id));
                if (
                    live?.pending?.some((entry) => entry.params?.requestId === request.requestId) ||
                    live?.outcomes?.[request.requestId]
                )
                    owners.add(owner.id);
            }
        }
        if (
            !targets.length &&
            operation?.projectId === logicalId &&
            operation.executionProjectId &&
            !(name === "workspace" && request.operation.startsWith("worktree"))
        )
            owners.add(operation.executionProjectId);
        if (request.executionProjectId !== undefined) {
            if (!this.owners(logicalId).some((p) => p.id === request.executionProjectId))
                throw new Error("执行工作区不属于此逻辑项目");
            owners.add(request.executionProjectId);
        }
        if (owners.size > 1) throw new Error("一次操作不能跨越不同执行工作区");
        return {
            ...request,
            projectId: [...owners][0] ?? original.id,
            logicalProjectId: logicalId,
        };
    }
    async persist(value) {
        await mkdir(join(this.backend.home, "worktree-requests"), { recursive: true, mode: 0o700 });
        await this.backend.save(this.key(value.requestId), value);
        this.records.set(value.requestId, value);
        this.backend.onChange();
        return value;
    }
    async transition(value, state, patch = {}) {
        return this.persist({
            ...value,
            ...patch,
            state,
            events: [
                ...(value.events ?? []),
                {
                    id: `${value.requestId}:${(value.events ?? []).length}`,
                    state,
                    time: new Date().toISOString(),
                    ...(patch.message ? { message: patch.message } : {}),
                },
            ],
        });
    }
    settings() {
        return {
            worktreeRoot: "",
            branchPrefix: "areal",
            ...this.backend.library.value.settings.worktrees,
        };
    }
    async configure(request) {
        const { worktreeRoot, branchPrefix } = request;
        if (
            typeof worktreeRoot !== "string" ||
            worktreeRoot.length > 4096 ||
            /[\0\r\n]/.test(worktreeRoot) ||
            (worktreeRoot &&
                (!isAbsolute(worktreeRoot) || worktreeRoot.split(/[\\/]/).includes("..")))
        )
            throw new Error("工作树根目录必须是绝对目录");
        if (
            typeof branchPrefix !== "string" ||
            !branchPrefix ||
            branchPrefix.length > 120 ||
            !/^[-\w/.]+$/.test(branchPrefix) ||
            branchPrefix.startsWith("-") ||
            branchPrefix.includes("..") ||
            branchPrefix.endsWith("/") ||
            branchPrefix.includes("//")
        )
            throw new Error("分支前缀无效");
        if (worktreeRoot) {
            let cursor = parse(resolve(worktreeRoot)).root;
            for (const part of relative(cursor, resolve(worktreeRoot)).split("/").filter(Boolean)) {
                cursor = join(cursor, part);
                try {
                    const stat = await lstat(cursor);
                    if (stat.isSymbolicLink() || !stat.isDirectory())
                        throw new Error("工作树根目录不能经过符号链接或文件");
                } catch (error) {
                    if (error.code !== "ENOENT") throw error;
                }
            }
        }
        await this.backend.library.change((state) => {
            state.settings.worktrees = { worktreeRoot, branchPrefix };
        });
        return this.settings();
    }
    async options(project, sourceRoot) {
        const logical = this.backend.saved.find((p) => p.id === this.logicalId(project));
        const worktrees = await git.listWorktrees(logical.root);
        const selected = sourceRoot ? await realpath(sourceRoot) : await realpath(logical.root);
        if (
            !worktrees.some(
                (value) => value.root === selected || selected.startsWith(value.root + "/"),
            )
        )
            throw new Error("来源工作树不属于此仓库");
        const branches = (await git.reviewBranches(selected)).branches
            .map((value) => (typeof value === "string" ? value : (value.name ?? value.branch)))
            .filter(Boolean);
        return { worktrees, branches, settings: this.settings() };
    }
    async register(logicalProject, record, requestId) {
        const b = this.backend,
            root = await realpath(record.cwd ?? record.directory),
            id = createHash("sha256").update(root).digest("hex").slice(0, 24);
        const registration = (b.projectWrites ?? Promise.resolve())
            .catch(() => {})
            .then(async () => {
                const existing = b.saved.find((p) => p.id === id);
                if (existing) {
                    if (existing.root !== root || existing.logicalProjectId !== logicalProject.id)
                        throw new Error("目标目录已经登记为其它项目");
                    return;
                }
                const saved = [
                    ...b.saved,
                    { id, root, logicalProjectId: logicalProject.id, worktreeRequestId: requestId },
                ];
                await b.save("projects.json", saved);
                b.saved = saved;
            });
        b.projectWrites = registration.catch(() => {});
        await registration;
        return id;
    }
    async createThread(project, request) {
        if (project.logicalProjectId) throw new Error("请从逻辑项目创建会话");
        const queueId = (await git.checkoutRoot(project.root)) ?? (await realpath(project.root));
        const key = this.key(request.requestId),
            previous = this.queues.get(queueId) ?? Promise.resolve();
        const task = previous
            .catch(() => {})
            .then(() => this.createThreadInner(project, request, key));
        this.queues.set(queueId, task);
        try {
            return await task;
        } catch (error) {
            const record = this.records.get(request.requestId);
            if (
                record?.projectId === project.id &&
                isDeepStrictEqual(record.parameters, signature(request)) &&
                !["ready", "failed"].includes(record.state)
            ) {
                Object.assign(error, { requestId: request.requestId, submissionUnknown: true });
            }
            throw error;
        } finally {
            if (this.queues.get(queueId) === task) this.queues.delete(queueId);
        }
    }
    async createThreadInner(project, request, key) {
        const b = this.backend,
            requestId = request.requestId,
            parameters = signature(request);
        let value = this.records.get(requestId);
        if (value) {
            if (
                value.projectId !== project.id ||
                value.kind !== "thread" ||
                !isDeepStrictEqual(value.parameters, parameters)
            )
                throw new Error("原创建请求的参数不可修改");
            if (value.state === "ready") return { threadId: value.threadId, requestId };
            if (value.state === "failed")
                throw Object.assign(new Error(value.message ?? "原工作树创建失败，请使用新请求"), {
                    requestId,
                    submissionUnknown: false,
                });
            return this.resumeThread(project, value, request);
        }
        const sourceRoot = request.worktree?.sourceRoot
            ? await realpath(request.worktree.sourceRoot)
            : await realpath(project.root);
        const live = await b.start(project.id);
        b.assertThreadCreationAvailable(live, request);
        await b.listThreads(live);
        const checkout = await git.checkoutRoot(project.root);
        const aliases =
            checkout &&
            (
                await Promise.all(
                    b.saved
                        .filter((saved) => saved.id !== project.id)
                        .map(async (saved) => (await git.checkoutRoot(saved.root)) === checkout),
                )
            ).some(Boolean);
        const occupied =
            aliases ||
            live.summaries.some((thread) => !thread.parentThreadId) ||
            [...this.records.values()].some(
                (record) =>
                    record.projectId === project.id &&
                    record.kind === "thread" &&
                    record.usesSource &&
                    record.state !== "failed",
            );
        const isolate = !!request.worktree || occupied;
        value = {
            kind: "thread",
            requestId,
            projectId: project.id,
            parameters,
            sourceRoot,
            automatic: !request.worktree && isolate,
            usesSource: !isolate,
            state: "creating",
            events: [],
        };
        await mkdir(join(b.home, "worktree-requests"), { recursive: true, mode: 0o700 });
        try {
            await writeFile(join(b.home, key), JSON.stringify(value), { flag: "wx", mode: 0o600 });
        } catch (error) {
            if (error.code !== "EEXIST") throw error;
            throw unavailable("创建标识已有未加载记录，请重新连接后核对");
        }
        this.records.set(requestId, value);
        value = await this.transition(value, "creating");
        try {
            if (isolate) {
                const spec = { ...this.settings(), ...request.worktree };
                const record = await git.createTask(project.root, b.home, {
                    taskId: requestId,
                    sourceRoot,
                    source: spec.ref ? "branch" : "head",
                    ref: spec.ref || undefined,
                    worktreeRoot: spec.worktreeRoot || undefined,
                    branch: spec.branch || undefined,
                    branchPrefix: spec.branchPrefix,
                });
                value = await this.transition(value, "created", {
                    record,
                    message: "新线程从固定提交创建。来源暂存、未暂存、未跟踪和忽略文件均未复制。",
                });
                const executionProjectId = await this.register(project, record, requestId);
                value = await this.persist({ ...value, executionProjectId });
            } else value = await this.persist({ ...value, executionProjectId: project.id });
        } catch (error) {
            if (value.record)
                await this.persist({ ...value, state: "created", message: error.message });
            else
                await this.transition(value, error.worktreeUncertain ? "unknown" : "failed", {
                    message: error.message,
                });
            throw error;
        }
        return this.resumeThread(project, value, request);
    }
    async resumeThread(project, value, request) {
        const b = this.backend;
        if (value.state === "unknown" || value.state === "creating") {
            if (value.usesSource && value.executionProjectId)
                value = await this.persist({ ...value, state: "created" });
            else {
                const record = await git.readTaskCreation(b.home, value.requestId);
                if (!record)
                    throw unavailable("原创建结果尚未确认，不会重新创建目录或在来源目录执行");
                const executionProjectId = await this.register(project, record, value.requestId);
                value = await this.transition(value, "created", { record, executionProjectId });
            }
        }
        if (!value.executionProjectId && value.record) {
            const executionProjectId = await this.register(project, value.record, value.requestId);
            value = await this.persist({ ...value, executionProjectId });
        }
        if (!value.executionProjectId) throw unavailable("执行目录登记尚未确认");
        let execution;
        try {
            execution = await b.start(value.executionProjectId);
        } catch (error) {
            await this.persist({ ...value, message: error.message });
            throw error;
        }
        if (value.state === "binding") {
            const receipt = await b.readSubmission(execution, "areal/thread/start", {
                requestId: value.requestId,
            });
            const threadId = receipt.result?.threadId ?? receipt.result?.thread?.id;
            if (!receipt.confirmed || !threadId)
                throw unavailable("原线程创建回执尚未确认，不会重发或回退来源目录");
            value = await this.transition(value, "ready", { threadId });
            await b.openThread(execution, threadId);
            return { threadId, requestId: value.requestId };
        }
        value = await this.transition(value, "binding");
        try {
            const result = await b.createThreadInProject(execution, {
                ...request,
                requestId: value.requestId,
            });
            await this.transition(value, "ready", { threadId: result.threadId });
            return result;
        } catch (error) {
            if (
                error.submissionUnknown === false ||
                ["noMutation", "rejected"].includes(error.outcome?.kind)
            )
                await this.transition(value, "failed", { message: error.message });
            else await this.persist({ ...value, message: error.message });
            throw error;
        }
    }
    async read(project, requestId) {
        this.key(requestId);
        let value = this.records.get(requestId);
        if (!value) return { state: "missing" };
        if (value.projectId !== this.logicalId(project))
            throw new Error("工作树创建请求不属于此项目");
        if (value.kind === "checkout" && ["creating", "unknown"].includes(value.state)) {
            const record = await git.readTaskCreation(this.backend.home, requestId);
            if (record) value = await this.transition(value, "created", { record });
        }
        if (value.kind === "thread" && value.state === "binding") {
            try {
                await this.resumeThread(
                    this.backend.saved.find((p) => p.id === value.projectId),
                    value,
                    { ...value.parameters, requestId },
                );
                value = this.records.get(requestId);
            } catch {}
        }
        return value;
    }
    async create(project, request) {
        if (request.source === "working-tree")
            throw new Error("不再自动提交或复制未提交改动，请选择固定分支或提交");
        const requestId = request.requestId,
            key = this.key(requestId);
        const parameters = JSON.parse(
            JSON.stringify({
                source: request.source ?? "head",
                sourceRoot: request.sourceRoot,
                ref: request.source === "branch" ? request.ref : undefined,
                worktreeRoot: request.worktreeRoot,
                branch: request.branch,
                branchPrefix: request.branchPrefix,
            }),
        );
        const existing = this.records.get(requestId);
        if (existing) {
            if (!isDeepStrictEqual(existing.parameters, parameters))
                throw new Error("原创建请求的参数不可修改");
            return this.read(project, requestId);
        }
        let value = {
            kind: "checkout",
            requestId,
            projectId: this.logicalId(project),
            parameters,
            state: "creating",
            events: [],
        };
        await mkdir(join(this.backend.home, "worktree-requests"), { recursive: true, mode: 0o700 });
        await writeFile(join(this.backend.home, key), JSON.stringify(value), {
            flag: "wx",
            mode: 0o600,
        });
        this.records.set(requestId, value);
        try {
            const record = await git.createTask(project.root, this.backend.home, {
                ...parameters,
                taskId: requestId,
            });
            return this.transition(value, "created", { record });
        } catch (error) {
            return this.transition(value, error.worktreeUncertain ? "unknown" : "failed", {
                message: error.message,
            });
        }
    }
    async open(project, requestId) {
        const value = await this.read(project, requestId);
        if (value.kind === "thread" && value.state === "ready")
            return {
                projectId: value.projectId,
                threadId: value.threadId,
                root: value.record?.directory ?? project.root,
            };
        if (value.kind !== "checkout" || value.state !== "created")
            throw unavailable("工作树创建尚未确认");
        const actual = await git.readTaskCreation(this.backend.home, requestId);
        if (!actual) throw unavailable("原工作树已不可用");
        const logical = this.backend.saved.find((p) => p.id === value.projectId),
            executionProjectId = await this.register(logical, actual, requestId);
        const next = await this.persist({
            ...value,
            kind: "thread",
            executionProjectId,
            parameters: {},
            sourceRoot: actual.target,
        });
        const result = await this.resumeThread(logical, next, { requestId });
        return { projectId: logical.id, root: actual.directory, ...result };
    }
    async connectExecutions(logicalId) {
        return Promise.allSettled(
            this.owners(logicalId)
                .filter((p) => p.id !== logicalId)
                .map((p) => this.backend.start(p.id)),
        );
    }
    decorate(project, thread) {
        const b = this.backend,
            live = b.projects.get(project.id);
        const operation = [...this.records.values()].find(
            (value) =>
                value.executionProjectId === project.id && value.record && value.state === "ready",
        );
        const worktree = operation
            ? {
                  state: "ready",
                  directory: project.root,
                  checkoutRoot: operation.record.directory,
                  branch: operation.record.branch,
                  base: operation.record.base,
                  sourceRoot: operation.sourceRoot ?? operation.record.target,
                  requestId: operation.requestId,
                  automatic: operation.automatic === true,
              }
            : undefined;
        return {
            ...thread,
            executionProjectId: project.id,
            executionCore: project.core ?? {
                instanceId: live?.service?.serviceId ?? null,
                connectionGeneration: live?.connectionGeneration ?? 0,
            },
            executionConnected: project.state?.connected === true,
            executionError: project.error ?? project.state?.error ?? null,
            ...(worktree ? { worktree, worktreeEvents: operation.events } : {}),
        };
    }
    aggregate(rows) {
        return rows
            .filter((row) => !row.logicalProjectId)
            .map((logical) => {
                const owners = rows.filter(
                        (row) => row.id === logical.id || row.logicalProjectId === logical.id,
                    ),
                    state = { ...logical.state, threads: {}, interactions: {}, queues: {} };
                const configurations = {},
                    outcomes = {},
                    observationErrors = {},
                    refreshErrors = {},
                    executionErrors = {},
                    summaries = [],
                    pending = [];
                for (const owner of owners) {
                    for (const [id, thread] of Object.entries(owner.state?.threads ?? {}))
                        state.threads[id] = this.decorate(owner, thread);
                    Object.assign(state.interactions, owner.state?.interactions);
                    Object.assign(state.queues, owner.state?.queues);
                    if (owner.state?.tasks) state.tasks = { ...state.tasks, ...owner.state.tasks };
                    Object.assign(configurations, owner.configurations);
                    Object.assign(outcomes, owner.outcomes);
                    Object.assign(observationErrors, owner.observationErrors);
                    Object.assign(refreshErrors, owner.refreshErrors);
                    summaries.push(
                        ...(owner.summaries ?? []).map((thread) => this.decorate(owner, thread)),
                    );
                    pending.push(...(owner.pending ?? []));
                    if (owner.error || owner.state?.connected === false)
                        executionErrors[owner.id] =
                            owner.error ?? owner.state?.error ?? "执行工作区未连接";
                }
                const operations = [...this.records.values()].filter(
                    (record) => record.projectId === logical.id,
                );
                return {
                    ...logical,
                    state: owners.some((owner) => owner.state) ? state : null,
                    configurations,
                    outcomes,
                    observationErrors,
                    refreshErrors,
                    summaries,
                    pending,
                    executionErrors,
                    worktreeOperations: operations,
                    worktreeSettings: this.settings(),
                };
            });
    }
}
module.exports = { CoreWorktrees };
