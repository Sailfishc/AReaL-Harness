"use strict";
const { randomUUID } = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const executeFile = promisify(execFile);
const { mkdir, realpath } = require("node:fs/promises");
const { join } = require("node:path");
const { executeCore } = require("./core-process.cjs");
const { validateCommand } = require("@areal/workbench/desktop-contract");

function publicTask(task) {
    if (
        !task ||
        task.schemaVersion !== 1 ||
        typeof task.id !== "string" ||
        !Number.isSafeInteger(task.sequence) ||
        typeof task.resultsAvailable !== "boolean" ||
        typeof task.cleanupConfirmed !== "boolean"
    )
        throw new Error("独立任务状态无效，请检查 Core 版本");
    return {
        id: task.id,
        requestId: task.requestId,
        sequence: task.sequence,
        phase: task.phase,
        resource: task.resource,
        resultsAvailable: task.resultsAvailable,
        cleanupConfirmed: task.cleanupConfirmed,
        exitCode: task.exitCode,
        prompt: task.input.prompt,
        commit: task.input.commit,
        modelName: task.input.modelName,
        testCommand: task.input.testCommand,
        manifest: task.manifest,
    };
}

// Core 的账本是唯一任务所有者；此层只选可信参数、校验项目归属和投影。
class CloudTasks {
    constructor(backend) {
        this.backend = backend;
        this.store = join(backend.home, "cloud-tasks");
        this.plans = new Map();
    }
    async execute(args, env, { timeout = 30000, maxBuffer = 4 * 1024 * 1024 } = {}) {
        try {
            const { stdout } = await executeCore(
                this.backend.binary,
                ["cloud-task", "--store", this.store, ...args],
                {
                    env: env || this.backend.hooks.environment(),
                    timeout,
                    maxBuffer,
                },
            );
            return JSON.parse(stdout);
        } catch (cause) {
            const detail = this.backend.providers
                .redact(cause.stderr || cause.message)
                .slice(0, 2048);
            const message = /requires committed code|clean committed|committed tree/.test(detail)
                ? args[0] === "apply"
                    ? "当前工作区有本地改动，未应用任何文件。"
                    : "工作区有未提交代码，请使用干净的工作树。未发送任何文件。"
                : /symlinks and submodules|sensitive path|unsafe relative|archive omits/.test(
                        detail,
                    )
                  ? "当前路径无法安全打包，请查看详细原因。"
                  : /Docker CLI unavailable|Docker context unavailable|Cannot connect|failed to connect|permission denied|No such image|cloud-task OCI image/.test(
                          detail,
                      )
                    ? "Docker 或任务镜像不可用，请先检查本机环境。"
                    : /HEAD differs/.test(detail)
                      ? "本地代码版本已变化，请审阅后手动处理。"
                      : detail.replace(/^AReaL:\s*/, "").split("\n")[0];
            throw Object.assign(new Error(message), { code: "CLOUD_TASK_ERROR", detail });
        }
    }
    async environment(project, model) {
        await this.backend.providers.prepare();
        const catalog = await this.backend.providers.config.current();
        const ref = model || catalog.defaultModel;
        const env = {
            ...this.backend.hooks.environment(),
            ...this.backend.providers.environment(),
        };
        // GUI 的隔离 HOME 不改变宿主 Docker context；只取本机 socket，不复制 Docker 凭据。
        if (!process.env.DOCKER_HOST) {
            const { stdout } = await executeFile("docker", ["context", "inspect"], {
                env: process.env,
                timeout: 5000,
                maxBuffer: 1024 * 1024,
            });
            env.DOCKER_HOST = JSON.parse(stdout)[0].Endpoints.docker.Host;
        } else env.DOCKER_HOST = process.env.DOCKER_HOST;
        if (!env.DOCKER_HOST.startsWith("unix:///")) throw new Error("首版仅支持本机 Docker");
        delete env.DOCKER_CONTEXT;
        if (ref) {
            const provider = catalog.data.find((p) => p.id === ref.providerId);
            if (
                !provider ||
                provider.enabled === false ||
                !provider.models.some((m) => (typeof m === "string" ? m : m.id) === ref.modelId)
            )
                throw new Error("所选模型已不可用，请重新选择");
            let transport = provider;
            if (!provider.endpoint) {
                const live = this.backend.projects.get(project.id);
                if (!live?.client?.ready) throw new Error("账号模型连接不可用，请先连接当前项目");
                transport = (await live.client.request("areal/provider/list")).data.find(
                    (p) => p.id === ref.providerId,
                );
                if (!transport?.endpoint) throw new Error("账号模型传输不可用，请检查现有模型设置");
            }
            Object.assign(env, {
                AREAL_HARNESS_MODEL: ref.modelId,
                AREAL_HARNESS_MODEL_PROVIDER: ref.providerId,
                AREAL_HARNESS_MODEL_ENDPOINT: transport.endpoint,
                AREAL_HARNESS_MODEL_PROTOCOL:
                    transport.protocol === "chatCompletions"
                        ? "chat-completions"
                        : transport.protocol,
                ...(transport.apiKeyEnv || transport.credentialRef
                    ? {
                          AREAL_HARNESS_API_KEY_ENV:
                              transport.apiKeyEnv || `AREAL_CREDENTIAL_${transport.credentialRef}`,
                      }
                    : {}),
            });
        }
        return { env, config: catalog.path || this.backend.config };
    }
    async ownedTask(project, id) {
        const task = await this.execute(["status", id]);
        if (task.input.workspace !== project.root) throw new Error("任务不属于当前工作区");
        return task;
    }
    async assertSettled() {
        for (const project of this.backend.saved) {
            const tasks = await this.execute(["list", "--workspace", project.root]);
            if (tasks.some((task) => !["ready", "cancelled", "failed"].includes(task.phase)))
                throw Object.assign(
                    new Error("独立环境任务仍有资源，请先在项目菜单中取消或核对任务。"),
                    { code: "CLOUD_TASK_RESOURCES" },
                );
        }
    }
    async command(request) {
        validateCommand("cloudTask", request);
        const saved = this.backend.saved.find((p) => p.id === request.projectId);
        if (!saved) throw new Error("未知项目");
        const project = { ...saved, root: await realpath(saved.root) };
        const op = request.operation;
        if (op === "list") {
            const tasks = await this.execute(["list", "--workspace", project.root]);
            return {
                tasks: tasks.map(publicTask),
                image: process.env.AREAL_CLOUD_TASK_IMAGE || "areal-cloud-task:local",
            };
        }
        if (op === "recover") {
            const task = await this.execute(["find", "--request-id", request.requestId]);
            if (task && task.input.workspace !== project.root)
                throw new Error("受理记录不属于当前工作区");
            return { task: task ? publicTask(task) : null };
        }
        if (op === "plan") {
            const { env, config } = await this.environment(project, request.model);
            const args = [
                "--workspace",
                project.root,
                "--image",
                request.image || process.env.AREAL_CLOUD_TASK_IMAGE || "areal-cloud-task:local",
                "--prompt",
                request.prompt,
                ...(request.testCommand?.trim() ? ["--test-command", request.testCommand] : []),
                ...(config ? ["--config", config] : []),
            ];
            const plan = await this.execute(["plan", ...args], env);
            for (const [key, value] of this.plans)
                if (value.expires < Date.now()) this.plans.delete(key);
            if (this.plans.size >= 32) throw new Error("计划过多，请关闭旧计划后重试");
            const planId = randomUUID();
            // SHA 与镜像 digest 固定；submit 再由 Core 核对计划摘要，不信任 Renderer 回传的内容。
            args[args.indexOf("--image") + 1] = plan.input.image;
            args.push("--revision", plan.input.commit);
            this.plans.set(planId, {
                projectId: project.id,
                args,
                hash: plan.planHash,
                model: request.model,
                expires: Date.now() + 300000,
            });
            return {
                planId,
                commit: plan.input.commit,
                modelName: plan.input.modelName,
                files: plan.files,
                bytes: plan.bytes,
                image: plan.input.image,
                location: "本机 Docker",
                prompt: plan.input.prompt,
            };
        }
        if (op === "submit") {
            if (request.planId !== request.requestId) throw new Error("提交标识与计划不匹配");
            const accepted = await this.execute(["find", "--request-id", request.requestId]);
            if (accepted) {
                if (accepted.input.workspace !== project.root)
                    throw new Error("任务不属于当前工作区");
                return publicTask(accepted);
            }
            const plan = this.plans.get(request.planId);
            if (!plan || plan.projectId !== project.id || plan.expires < Date.now())
                throw new Error("计划已过期，请重新预览");
            const { env } = await this.environment(project, plan.model);
            try {
                const task = await this.execute(
                    [
                        "submit",
                        ...plan.args,
                        "--expected-plan",
                        plan.hash,
                        "--request-id",
                        request.requestId,
                    ],
                    env,
                );
                this.plans.delete(request.planId);
                return publicTask(task);
            } catch (error) {
                // 命令退出不证明未受理；只允许查询 requestId，界面不会自动重发。
                throw Object.assign(error, {
                    submissionUnknown: true,
                    requestId: request.requestId,
                });
            }
        }
        await this.ownedTask(project, request.id);
        if (op === "read") {
            const result = await this.execute([
                "inspect",
                request.id,
                "--after",
                String(request.after || 0),
            ]);
            return {
                task: publicTask(result.task),
                events: result.events.map((e) => ({
                    taskId: e.taskId,
                    sequence: e.sequence,
                    phase: e.phase,
                    message: this.backend.providers.redact(e.message).slice(0, 2048),
                })),
            };
        }
        if (op === "review") return this.execute(["review", request.id]);
        if (op === "cancel" || op === "retry" || op === "reconcile") {
            return publicTask(
                await this.execute([op === "retry" ? "retry-results" : op, request.id]),
            );
        }
        if (op === "download") {
            const root = join(this.backend.home, "cloud-results");
            await mkdir(root, { recursive: true, mode: 0o700 });
            const directory = join(root, `${request.id}-${randomUUID()}`);
            await this.execute(["results", request.id, "--output", directory]);
            return { verified: true, directory };
        }
        if (op === "apply") {
            const live = this.backend.projects.get(project.id);
            if (
                live?.pending?.length ||
                Object.values(live?.model?.state?.threads || {}).some(
                    (t) => t.activeTurnId || t.status?.type === "running",
                )
            )
                throw new Error("请先等待当前工作区的本地任务结束");
            await this.execute(["apply", request.id, "--workspace", project.root]);
            return { applied: true };
        }
        throw new Error("未知独立任务操作");
    }
}
module.exports = { CloudTasks, publicTask };
