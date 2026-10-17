const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, writeFile, readFile, rm } = require("node:fs/promises");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { CloudSettings } = require("../app/src/core/cloud-settings.cjs");
const { validateCommand } = require("../packages/workbench/client/desktop-contract.cjs");

test("Cloud 凭据状态不回显token，地址变更不能沿用旧凭据", async (t) => {
    const home = await mkdtemp(join(tmpdir(), "areal-cloud-"));
    t.after(() => rm(home, { recursive: true, force: true }));
    // 加密测试替身只证明调用边界，不代替操作系统安全存储验收。
    const encryption = {
        isEncryptionAvailable: () => true,
        encryptString: (text) => Buffer.from(`sealed:${text}`),
        decryptString: (buffer) => buffer.toString().slice(7),
    };
    const backend = {
        home,
        save: (name, value) => writeFile(join(home, name), JSON.stringify(value), { mode: 0o600 }),
    };
    const settings = new CloudSettings(backend, encryption);
    assert.deepEqual(await settings.status(), { baseURL: "", tokenConfigured: false });
    const result = await settings.command({
        operation: "save",
        baseURL: "https://one.test/api/",
        token: "secret-value",
    });
    assert.deepEqual(result, { baseURL: "https://one.test/api", tokenConfigured: true });
    assert.equal(JSON.stringify(await settings.status()).includes("secret-value"), false);
    assert.equal(
        (await readFile(join(home, "cloud.json"), "utf8")).includes("secret-value"),
        false,
    );
    await assert.rejects(
        settings.command({ operation: "save", baseURL: "https://two.test/api" }),
        /token/,
    );
    assert.equal((await settings.status()).baseURL, "https://one.test/api");
    await settings.command({ operation: "save", baseURL: "https://one.test/api" });
    assert.equal((await settings.client()).token, "secret-value");
    await settings.command({
        operation: "save",
        baseURL: "https://two.test/api",
        token: "new-secret",
    });
    assert.equal((await settings.client()).token, "new-secret");
});

test("系统安全存储不可用时拒绝明文降级", async () => {
    let saved = false;
    const settings = new CloudSettings(
        {
            home: "/nonexistent/cloud-test",
            save: () => {
                saved = true;
            },
        },
        {
            isEncryptionAvailable: () => true,
            getSelectedStorageBackend: () => "basic_text",
        },
    );
    await assert.rejects(
        settings.command({ operation: "save", baseURL: "https://one.test", token: "secret" }),
        /安全存储/,
    );
    assert.equal(saved, false);
});

test("桌面窄契约接受 Cloud 配置，拒绝无效操作及未声明字段", () => {
    validateCommand("cloud", { operation: "status" }, { serviceOnly: true });
    validateCommand("cloud", {
        operation: "save",
        baseURL: "https://backend.test",
        token: "secret",
    });
    assert.throws(() => validateCommand("cloud", { operation: "execute", shell: "command" }));
    assert.throws(() => validateCommand("cloud", { operation: "save", baseURL: 123 }));
});

test("连接检查只读认证接口，拒绝错误凭据及非协议响应", async (t) => {
    const { createServer } = require("node:http");
    const { CloudClient } = require("../app/src/core/cloud-client.cjs");
    let response = "ok";
    const requests = [];
    const server = createServer((req, res) => {
        requests.push([req.method, req.url, req.headers.authorization]);
        if (response === "unauthorized") { res.writeHead(401); res.end(); return; }
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(response === "ok" ? { items: [] } : { healthy: true }));
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const settings = new CloudSettings({}, {});
    settings.client = async () => new CloudClient({ baseURL: `http://127.0.0.1:${server.address().port}/openapi/v1`, token: "check-token" });
    validateCommand("cloud", { operation: "check" }, { serviceOnly: true });
    assert.deepEqual(await settings.command({ operation: "check" }), { connected: true });
    response = "unauthorized";
    await assert.rejects(settings.command({ operation: "check" }), /401/);
    response = "invalid";
    await assert.rejects(settings.command({ operation: "check" }), /无效/);
    assert.equal(requests.length, 3);
    for (const request of requests) assert.deepEqual(request, ["GET", "/openapi/v1/harness-sessions?limit=1", "Bearer check-token"]);
});
