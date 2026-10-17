"use strict";

const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { CloudSession } = require("./cloud-session.cjs");

/** 本地只保存远端身份和导航摘要；消息从远端 Core 读取。 */
class CloudConversations {
    constructor(backend) {
        this.backend = backend;
        this.records = [];
        this.live = new Map();
        this.creating = new Map();
    }
    async init() {
        try {
            this.records = JSON.parse(
                await readFile(join(this.backend.home, "cloud-sessions.json"), "utf8"),
            );
        } catch (error) {
            if (error.code !== "ENOENT") throw error;
        }
        if (!Array.isArray(this.records)) throw new Error("Cloud 会话索引无效");
    }
    async save() {
        await this.backend.save("cloud-sessions.json", structuredClone(this.records));
        this.backend.onChange();
    }
    owns(projectId, threadId) {
        return this.records.some(
            (record) => record.projectId === projectId && record.binding.threadId === threadId,
        );
    }
    projection(projectId) {
        const threads = {},
            summaries = [];
        for (const record of this.records.filter(
            (value) => value.projectId === projectId && value.binding.threadId,
        )) {
            const live = this.live.get(record.id);
            const cloud = {
                sessionId: record.binding.sessionId,
                connected: live?.session.client?.ready === true,
                error: live?.error ?? null,
            };
            const id = record.binding.threadId;
            const summary = {
                id,
                name: record.title,
                preview: record.title,
                createdAt: record.createdAt,
                updatedAt: record.updatedAt ?? record.createdAt,
                cloud,
            };
            summaries.push(summary);
            const thread = live?.model.state.threads[id];
            threads[id] = {
                ...(thread ?? { ...summary, turns: [], status: { type: "idle" } }),
                cloud,
            };
        }
        return { threads, summaries };
    }
    async context(record) {
        const platform = await this.backend.cloud.client();
        if (record.binding.baseURL !== platform.baseURL.href)
            throw new Error("此会话属于另一个 Cloud 后端，请恢复原后端配置");
        if (this.live.has(record.id)) {
            const live = this.live.get(record.id);
            live.session.platform = platform;
            return live;
        }
        const { CoreTaskModel } = await import("@areal/workbench/core-model");
        // 异步模块加载期间可能有另一个读取先建立连接。
        if (this.live.has(record.id)) return this.live.get(record.id);
        const model = new CoreTaskModel();
        const live = { model, session: null, error: null, submitting: false };
        model.subscribe(() => this.backend.onChange());
        live.session = new CloudSession({
            platform,
            binding: record.binding,
            save: async (binding) => {
                record.binding = binding;
                await this.save();
            },
            onNotification: (method, params) => {
                model.event(method, params);
                if (method === "turn/completed") {
                    record.updatedAt = Math.floor(Date.now() / 1000);
                    void this.save().catch((error) => {
                        live.error = error.message;
                        this.backend.onChange();
                    });
                }
            },
            onClose: () => {
                model.connection(false);
                this.backend.onChange();
            },
        });
        this.live.set(record.id, live);
        return live;
    }
    async open(record) {
        const live = await this.context(record);
        try {
            const result = await live.session.read();
            live.model.replace(result.thread);
            live.model.connection(true);
            live.error = null;
            this.backend.onChange();
            return live;
        } catch (error) {
            live.error = error.message;
            this.backend.onChange();
            throw error;
        }
    }
    create(request) {
        const id = request.requestId;
        if (!this.backend.saved.some((project) => project.id === request.projectId))
            throw new Error("请先选择项目");
        if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id))
            throw new Error("Cloud 创建请求标识无效");
        if (this.creating.has(id)) return this.creating.get(id);
        const task = (async () => {
            let record = this.records.find((value) => value.id === id);
            if (record && record.projectId !== request.projectId)
                throw new Error("Cloud 创建请求归属不匹配");
            if (!record) {
                const platform = await this.backend.cloud.client();
                record = {
                    id,
                    projectId: request.projectId,
                    title: "Cloud",
                    createdAt: Math.floor(Date.now() / 1000),
                    binding: { baseURL: platform.baseURL.href, createId: id, threadRequestId: id },
                };
                this.records.push(record);
                await this.save();
            }
            await this.open(record);
            return { threadId: record.binding.threadId, sessionId: record.binding.sessionId };
        })().finally(() => this.creating.delete(id));
        this.creating.set(id, task);
        return task;
    }
    async command(request) {
        if (request.operation === "create") return this.create(request);
        const record = this.records.find(
            (value) =>
                value.projectId === request.projectId &&
                value.binding.threadId === request.threadId,
        );
        if (!record) throw new Error("未知 Cloud 会话");
        if (request.operation === "open") {
            await this.open(record);
            return this.backend.snapshot();
        }
        const live = await this.context(record);
        if (request.operation === "send") {
            if (
                live.submitting ||
                live.model.state.threads[request.threadId]?.turns?.some(
                    (turn) => turn.status === "inProgress",
                )
            )
                throw new Error("请等待当前 Cloud 查询完成");
            live.submitting = true;
            try {
                const result = await live.session.query(request.text);
                if (record.title === "Cloud") {
                    record.title = `Cloud · ${request.text.slice(0, 60)}`;
                    await this.save();
                }
                return result;
            } finally {
                live.submitting = false;
            }
        }
        if (request.operation === "stop") {
            const client = await live.session.connect();
            return client.request("turn/interrupt", {
                threadId: request.threadId,
                turnId: request.turnId,
            });
        }
        throw new Error("不支持的 Cloud 会话操作");
    }
    close() {
        for (const live of this.live.values()) live.session.close();
    }
}

module.exports = { CloudConversations };
