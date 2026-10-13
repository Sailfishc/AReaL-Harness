"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, mkdir, rm, realpath } = require("node:fs/promises");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { randomUUID } = require("node:crypto");
const { CloudTasks, publicTask } = require("../app/src/core/cloud-tasks.cjs");
const { validateCommand } = require("../packages/workbench/client/desktop-contract.cjs");
test("Cloud request boundary forbids host paths, credentials, flags and cross-scope fields", () => {
    const base = { projectId: "project", operation: "plan", prompt: "change" };
    validateCommand("cloudTask", base, { serviceOnly: true });
    for (const fields of [
        { store: "/tmp/other" },
        { workspace: "/private" },
        { config: "key" },
        { apiKey: "secret" },
        { output: "/tmp/out" },
        { image: "--privileged" },
        { model: { providerId: "a", modelId: "b", secret: "key" } },
    ])
        assert.throws(() => validateCommand("cloudTask", { ...base, ...fields }));
    assert.throws(() =>
        validateCommand("cloudTask", { projectId: "project", operation: "read", id: "../outside" }),
    );
    assert.throws(() =>
        validateCommand("cloudTask", {
            projectId: "project",
            operation: "read",
            id: randomUUID(),
            after: -1,
        }),
    );
});
test("GUI projections do not expose original model configuration or Docker socket", () => {
    const value = publicTask({
        schemaVersion: 1,
        id: randomUUID(),
        sequence: 1,
        resultsAvailable: false,
        cleanupConfirmed: false,
        input: {
            prompt: "code",
            commit: "a".repeat(40),
            modelName: "model",
            modelConfig: "/private/model.toml",
            backend: { endpoint: "unix:///private/socket" },
        },
        phase: "accepted",
    });
    assert.equal(JSON.stringify(value).includes("/private/"), false);
});
test("UI splits multi-file patches and ignores old or foreign task responses", async () => {
    const { splitCloudPatch, projectCloudTask } =
        await import("../renderer/src/cloud-task-view.js");
    const patch =
        "diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1 +1 @@\n-before\n+after\ndiff --git a/b b/b\nnew file mode 100644\n";
    assert.equal(splitCloudPatch(patch).length, 2);
    const current = { id: "owner", sequence: 5 };
    assert.equal(projectCloudTask(current, { id: "owner", sequence: 4 }, "owner"), current);
    assert.equal(
        projectCloudTask(current, { id: "owner", sequence: 5, phase: "stale" }, "owner"),
        current,
    );
    assert.equal(projectCloudTask(current, { id: "other", sequence: 99 }, "owner"), current);
    assert.equal(projectCloudTask(current, { id: "owner", sequence: 6 }, "owner").sequence, 6);
});
test("frozen plan submission is idempotent, ownership survives recovery and cleanup blocks adapter shutdown", async () => {
    const root = await mkdtemp(join(tmpdir(), "cloud-contract-"));
    const rawRepo = join(root, "repo");
    await mkdir(rawRepo);
    const repo = await realpath(rawRepo);
    const backend = {
        home: root,
        saved: [{ id: "p", root: repo }],
        projects: new Map(),
        hooks: { environment: () => ({}) },
        providers: {
            redact: (v) => v,
            prepare: async () => {},
            environment: () => ({}),
            config: { current: async () => ({ path: "model.toml", data: [] }) },
        },
    };
    const controller = new CloudTasks(backend);
    controller.environment = async () => ({ env: {}, config: "model.toml" });
    let accepted = null,
        submits = 0;
    controller.execute = async (args) => {
        if (args[0] === "find") return accepted;
        if (args[0] === "plan")
            return {
                planHash: "hash",
                files: ["code.txt"],
                bytes: 100,
                input: { image: "digest", commit: "a".repeat(40), modelName: "model" },
            };
        if (args[0] === "submit") {
            submits++;
            assert.ok(args.includes("--expected-plan"));
            accepted = {
                schemaVersion: 1,
                id: randomUUID(),
                requestId: args.at(-1),
                sequence: 1,
                phase: "accepted",
                resultsAvailable: false,
                cleanupConfirmed: false,
                input: {
                    workspace: repo,
                    prompt: "code",
                    commit: "a".repeat(40),
                    modelName: "model",
                },
            };
            return accepted;
        }
        if (args[0] === "list") return accepted ? [accepted] : [];
        if (args[0] === "status") return accepted;
        throw Error("unexpected");
    };
    try {
        const plan = await controller.command({
            projectId: "p",
            operation: "plan",
            prompt: "code",
        });
        const request = {
            projectId: "p",
            operation: "submit",
            planId: plan.planId,
            requestId: plan.planId,
        };
        const first = await controller.command(request),
            again = await controller.command(request);
        assert.equal(first.id, again.id);
        assert.equal(submits, 1);
        assert.equal(
            (
                await controller.command({
                    projectId: "p",
                    operation: "recover",
                    requestId: plan.planId,
                })
            ).task.id,
            first.id,
        );
        await assert.rejects(controller.assertSettled(), /仍有资源/);
        accepted.phase = "ready";
        await controller.assertSettled();
        accepted.input.workspace = join(root, "other");
        await assert.rejects(
            controller.command({ projectId: "p", operation: "read", id: first.id }),
            /不属于/,
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
