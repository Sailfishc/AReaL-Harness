const { test } = require("node:test");
const assert = require("node:assert/strict");
const { backendURL, CloudClient } = require("../app/src/core/cloud-client.cjs");
test("统一 endpoint 不含平台路由推断，HTTP(S) 可规范化为 WS(S)", () => {
    assert.equal(
        backendURL("https://example.test/app-server/work").href,
        "wss://example.test/app-server/work/",
    );
    assert.equal(backendURL("ws://localhost:4500").href, "ws://localhost:4500/");
    for (const url of [
        "file:///tmp/x",
        "https://user:secret@host/",
        "wss://host/?token=x",
        "wss://host/#x",
    ])
        assert.throws(() => backendURL(url));
    assert.throws(() => new CloudClient({ baseURL: "ws://localhost", token: "a\nb" }));
});
