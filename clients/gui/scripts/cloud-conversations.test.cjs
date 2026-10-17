const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const { once } = require("node:events");
const { createRequire } = require("node:module");
const { resolve } = require("node:path");
const { randomUUID } = require("node:crypto");
const appRequire = createRequire(resolve(__dirname, "../app/package.json"));
const { WebSocketServer } = appRequire("ws");
const { CloudClient } = require("../app/src/core/cloud-client.cjs");
const { CloudConversations } = require("../app/src/core/cloud-conversations.cjs");

test("原生 WS 协议夹具：并发创建去重、流式投影、重启复用绑定且不重发 query", async (t) => {
    let allocations = 0,
        queries = 0,
        persisted = [];
    const thread = { id: "thread-one", turns: [], status: { type: "idle" } };
    const http = createServer((_req, res) => {
        res.writeHead(404);
        res.end();
    });
    const ws = new WebSocketServer({ server: http });
    ws.on("connection", (socket, req) => {
        assert.equal(req.headers.authorization, "Bearer token");
        socket.on("message", (raw) => {
            const { id, method, params } = JSON.parse(raw);
            if (!id) return;
            const reply = (result) => socket.send(JSON.stringify({ id, result }));
            if (method === "initialize") return reply({});
            if (method === "areal/capabilities")
                return reply({
                    apiVersion: "areal.core.v1",
                    methods: ["areal/thread/observe", "areal/thread/start"],
                });
            if (method === "areal/profile/list") return reply({ data: [] });
            if (method === "areal/thread/start") allocations++;
            if (method === "areal/thread/start" || method === "areal/thread/observe")
                return reply({ thread });
            assert.equal(method, "turn/start");
            assert.deepEqual(Object.keys(params).sort(), ["input", "threadId"]);
            queries++;
            const turn = { id: `turn-${queries}`, status: "inProgress", items: [] };
            reply({ turn });
            const event = (method, params) => socket.send(JSON.stringify({ method, params }));
            event("turn/started", { threadId: thread.id, turn });
            event("item/started", {
                threadId: thread.id,
                turnId: turn.id,
                item: { id: "answer", type: "agentMessage", text: "" },
            });
            event("item/agentMessage/delta", {
                threadId: thread.id,
                turnId: turn.id,
                itemId: "answer",
                delta: "streamed answer",
            });
            turn.status = "completed";
            turn.items = [{ id: "answer", type: "agentMessage", text: "streamed answer" }];
            thread.turns.push(turn);
            event("turn/completed", { threadId: thread.id, turn });
        });
    });
    http.listen(0, "127.0.0.1");
    await once(http, "listening");
    t.after(() => {
        for (const socket of ws.clients) socket.terminate();
        ws.close();
        http.closeAllConnections();
        http.close();
    });
    let platform = new CloudClient({
        baseURL: `http://127.0.0.1:${http.address().port}/api`,
        token: "token",
    });
    const backend = {
        saved: [{ id: "project" }],
        cloud: { client: async () => platform },
        save: async (_name, value) => {
            persisted = structuredClone(value);
        },
        onChange() {},
        snapshot() {
            return {};
        },
    };
    const manager = new CloudConversations(backend);
    t.after(() => manager.close());
    const request = { projectId: "project", operation: "create", requestId: randomUUID() };
    const [first, second] = await Promise.all([manager.command(request), manager.command(request)]);
    assert.deepEqual(first, second);
    assert.equal(allocations, 1);
    assert.equal(persisted[0].binding.sessionId, undefined);
    await manager.command({
        projectId: "project",
        threadId: first.threadId,
        operation: "send",
        text: "hello",
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(
        manager.projection("project").threads[first.threadId].turns[0].items[0].text,
        "streamed answer",
    );
    assert.equal(manager.owns("other-project", first.threadId), false);
    manager.close();
    const restored = new CloudConversations(backend);
    restored.records = persisted;
    t.after(() => restored.close());
    await restored.command({ projectId: "project", threadId: first.threadId, operation: "open" });
    assert.equal(allocations, 1);
    assert.equal(queries, 1);
    assert.equal(restored.projection("project").threads[first.threadId].turns.length, 1);
    platform = new CloudClient({
        baseURL: "https://another.example/api",
        token: "different-token",
    });
    await assert.rejects(
        restored.command({
            projectId: "project",
            threadId: first.threadId,
            operation: "send",
            text: "hello",
        }),
        /另一个 Cloud/,
    );
    assert.equal(queries, 1);
});
