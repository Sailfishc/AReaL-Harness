"use strict";

const { randomUUID } = require("node:crypto");
const WebSocket = require("ws");

/** 一个桌面会话固定一个平台 Session；不因 query 或重连重新分配持久卷。 */
class CloudSession {
    constructor({ platform, binding, save, onNotification = () => {}, onClose = () => {} }) {
        this.platform = platform;
        this.binding = binding;
        this.save = save;
        this.onNotification = onNotification;
        this.onClose = onClose;
        this.client = null;
        this.connecting = null;
        this.closed = false;
    }

    connect({ signal } = {}) {
        if (this.closed) return Promise.reject(new Error("Cloud 会话连接已关闭"));
        if (this.client?.ready) return Promise.resolve(this.client);
        if (this.connecting) return this.connecting;
        this.connecting = this.establish(signal).finally(() => {
            this.connecting = null;
        });
        return this.connecting;
    }

    async establish(signal) {
        const baseURL = this.platform.baseURL.href;
        if (this.binding.baseURL && this.binding.baseURL !== baseURL)
            throw new Error("此会话属于另一个 Cloud 后端，请恢复原后端配置");
        // 先持久化幂等键；网络中断后只能核对同一个创建意图。
        if (!this.binding.createId) {
            this.binding = {
                ...this.binding,
                baseURL,
                createId: randomUUID(),
                threadRequestId: randomUUID(),
            };
            await this.save(this.binding);
        }
        if (!this.binding.sessionId) {
            const session = await this.platform.createSession(this.binding.createId, { signal });
            if (!session?.session_id) throw new Error("Cloud 未返回 Session ID");
            this.binding = { ...this.binding, sessionId: session.session_id };
            await this.save(this.binding);
        }
        const connection = await this.platform.connectSession(this.binding.sessionId, { signal });
        if (this.closed || signal?.aborted) throw new Error("Cloud 连接已取消");
        const { CoreClient } = await import("@areal/runtime-client/core");
        const client = new CoreClient({
            createSocket: () =>
                new WebSocket(connection.endpoint, {
                    headers: { Authorization: `Bearer ${connection.credential}` },
                    followRedirects: false,
                    maxPayload: 4 * 1024 * 1024,
                }),
        });
        this.client?.close();
        this.client = client;
        client.onNotification((method, params) => this.onNotification(method, params));
        client.onClose(() => {
            if (this.client === client && !this.closed) this.onClose();
        });
        try {
            await client.connect();
            if (this.closed || signal?.aborted) throw new Error("Cloud 连接已取消");
            if (!this.binding.threadId) {
                const start = connection.threadStart;
                if (!["thread/start", "areal/thread/start"].includes(start?.method))
                    throw new Error("Cloud 未提供受支持的 thread/start 方法");
                const result = await client.request(start.method, {
                    requestId: this.binding.threadRequestId,
                    ...(start.agentProfile ? { agentProfile: start.agentProfile } : {}),
                });
                if (!result.thread?.id) throw new Error("Cloud 未返回 Thread ID");
                this.binding = { ...this.binding, threadId: result.thread.id };
                await this.save(this.binding);
            }
            return client;
        } catch (error) {
            client.close();
            throw error;
        }
    }

    async read({ signal } = {}) {
        const client = await this.connect({ signal });
        // 读取和订阅权威历史；重连不重放任何 turn/start。
        if (client.capabilities?.methods?.includes("areal/thread/observe")) {
            return client.request("areal/thread/observe", { threadId: this.binding.threadId });
        }
        return client.request("thread/resume", { threadId: this.binding.threadId });
    }

    async query(text, { signal } = {}) {
        if (typeof text !== "string" || !text.trim()) throw new Error("请输入消息");
        const client = await this.connect({ signal });
        await this.read({ signal });
        // 标准 turn/start 只接受 threadId/input；未知提交不得通过重试制造重复执行。
        return client.request("turn/start", {
            threadId: this.binding.threadId,
            input: [{ type: "text", text }],
        });
    }

    close() {
        this.closed = true;
        this.client?.close();
        // 关闭窗口只断开客户端；不停止云端 Session 或删除 UPFS。
    }
}

module.exports = { CloudSession };
