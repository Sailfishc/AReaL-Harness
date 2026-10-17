"use strict";
const WebSocket = require("ws");

function backendURL(value) {
    const url = new URL(value);
    if (
        !["http:", "https:", "ws:", "wss:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
    )
        throw new Error("Cloud 地址必须是无凭据、查询参数和片段的 app-server 地址");
    url.protocol = ["http:", "ws:"].includes(url.protocol) ? "ws:" : "wss:";
    url.pathname = url.pathname.replace(/\/+$/, "") + "/";
    return url;
}

/** Arena 与远程 Core 使用同一原生接口，客户端不管理平台 Session。 */
class CloudClient {
    constructor({ baseURL, token }) {
        this.baseURL = backendURL(baseURL);
        if (typeof token !== "string" || !token.trim() || /[\r\n]/.test(token))
            throw new Error("Cloud token 无效");
        this.token = token;
    }
    async connect({ onNotification = () => {}, onClose = () => {} } = {}) {
        const { CoreClient } = await import("@areal/runtime-client/core");
        const client = new CoreClient({
            timeoutMs: 180_000,
            createSocket: () =>
                new WebSocket(this.baseURL.href, {
                    headers: { Authorization: `Bearer ${this.token}` },
                    followRedirects: false,
                    maxPayload: 4 * 1024 * 1024,
                }),
        });
        client.onNotification(onNotification);
        client.onClose(onClose);
        try {
            await client.connect();
            if (
                client.capabilities?.apiVersion !== "areal.core.v1" ||
                !Array.isArray(client.capabilities.methods)
            )
                throw new Error("远端不是兼容的 AReaL app-server");
            return client;
        } catch (error) {
            client.close();
            throw error;
        }
    }
    async check() {
        const client = await this.connect();
        try {
            return { connected: true, apiVersion: client.capabilities.apiVersion };
        } finally {
            client.close();
        }
    }
}
module.exports = { CloudClient, backendURL };
