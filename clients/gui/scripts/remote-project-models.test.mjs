import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { createIdentity, identityId } from "../packages/remote/src/channel.mjs";
import { RemoteConnection } from "../packages/remote-client/src/index.mjs";
import { hostFixture, nativeProject, waitFor } from "./remote-relay-fixture.mjs";

const require = createRequire(new URL("../app/package.json", import.meta.url));
const WebSocket = require("ws");

async function fixture(t) {
  const f = await hostFixture(t);
  const native = await nativeProject(t, f);
  await f.remote.control({ operation: "enableDirect" });
  const invitation = await f.remote.control({ operation: "pair" });
  const inviteSecret = new URLSearchParams(new URL(invitation.payload).hash.slice(1)).get("invite");
  const identity = await createIdentity();
  const socket = new WebSocket(f.remote.direct.origin.replace(/^http/, "ws") + "/remote/socket", {
    origin: f.remote.direct.origin,
  });
  const client = new RemoteConnection({
    socket,
    identity,
    host: identityId(f.remote.config.identity),
    hello: { displayName: "Models reader", inviteSecret },
    isCurrent: () => true,
    onClose: () => {},
  });
  t.after(() => socket.terminate());
  const pending = client.connect({
    onHandshake() {},
    async onReady() {},
    onSession() {},
  });
  await waitFor(() => f.remote.pending.has(identityId(identity)));
  await f.remote.control({
    operation: "approve",
    id: identityId(identity),
    projects: ["project"],
    preset: "Observer",
  });
  await pending;
  const project = f.service.backend.projects.get("project");
  const read = (projectId = "project", params = {}) =>
    client.request({ method: "project.models", context: { projectId }, params });
  return { ...f, native, project, client, read };
}

test("an Observer reads a bounded project catalog without creating a thread or subscription", async (t) => {
  const f = await fixture(t);
  f.project.models = Array.from({ length: 210 }, (_, index) => ({
    providerId: "provider",
    modelId: `model-${index}`,
    displayName: `Model ${index}`,
    reasoningEffortOptions: ["low", "medium", "high"],
    available: index > 0,
    unavailableReason: index === 0 ? "Unavailable" : undefined,
    endpoint: "private-endpoint",
    apiKey: "private-key",
    providerRevision: "private-revision",
  }));
  const calls = [...f.native.calls];
  const writes = f.savedWrites.length;
  const description = await f.client.request({ method: "host.describe", params: {} });
  assert.ok(description.methods.includes("project.models"));
  const result = await f.read();
  assert.equal(result.models.length, 200);
  assert.equal(result.projectId, "project");
  assert.equal(result.serviceGeneration, "generation-1");
  assert.equal(result.grantRevision, 1);
  assert.equal(result.gatewayGeneration, f.remote.gatewayGeneration);
  assert.deepEqual(result.models[0], {
    providerId: "provider",
    modelId: "model-0",
    displayName: "Model 0",
    reasoningEffortOptions: ["low", "medium", "high"],
    available: false,
    unavailableReason: "Unavailable",
  });
  assert.ok(!JSON.stringify(result).includes("private-"));
  assert.deepEqual(f.native.calls, calls);
  assert.equal(f.savedWrites.length, writes);
  assert.equal(f.remote.sessions.observers.projects.size, 0);
  f.project.models = [];
  assert.deepEqual((await f.read()).models, []);
});

test("project catalog reads enforce scope, schema, online state and response budgets", async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.read("other"), { code: "FORBIDDEN" });
  await assert.rejects(f.read("project", { cursor: "injected" }), { code: "INVALID_PARAMS" });
  await assert.rejects(f.client.request({ method: "project.models", params: {} }), {
    code: "INVALID_PARAMS",
  });
  f.project.model.state.connected = false;
  await assert.rejects(f.read(), { code: "CORE_UNAVAILABLE" });
  f.project.model.state.connected = true;
  f.project.models = [{ modelId: "model", displayName: "x".repeat(128 * 1024) }];
  await assert.rejects(f.read(), { code: "LIMIT_EXCEEDED" });
  f.project.models = [{ providerId: "provider", modelId: "model" }];
  assert.equal((await f.read()).models[0].modelId, "model");
});

test("project catalog publication fences replacement during provider projection", async (t) => {
  const f = await fixture(t);
  f.project.models = [{ providerId: "provider", modelId: "model" }];
  f.service.backend.providers = {
    catalog(models, project) {
      project.service = { ...project.service, generation: "generation-2" };
      return models;
    },
  };
  await assert.rejects(f.read(), { code: "RESYNC_REQUIRED" });
  delete f.service.backend.providers;
  assert.equal((await f.read()).serviceGeneration, "generation-2");
});
