import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { waitFor } from "./remote-relay-fixture.mjs";
const require = createRequire(new URL("../app/package.json", import.meta.url));
const { CoreBackend } = require("../app/src/core/backend.cjs");
const { DesktopService } = require("../app/src/core/service-protocol.cjs");
const { RemoteControl } = require("../app/src/core/remote.cjs");

export async function mobileCoreFixture(t) {
  const home = await mkdtemp(join(tmpdir(), "mobile-workspace-"));
  const user = join(home, "user");
  await mkdir(join(user, ".areal"), { recursive: true });
  let requests = 0;
  const model = createServer(async (request, response) => {
    for await (const chunk of request) void chunk;
    requests++;
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.end(
      `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: `MOBILE_REPLY_${requests}` }, finish_reason: null }] })}\n\ndata: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n`,
    );
  });
  await new Promise((resolve) => model.listen(0, "127.0.0.1", resolve));
  await writeFile(
    join(user, ".areal/config.toml"),
    `schema_version=1\n[model]\nprovider="fixture"\nname="fixture"\n[model.providers.fixture]\nprotocol="chat-completions"\nendpoint="http://127.0.0.1:${model.address().port}/v1/chat/completions"\n`,
  );
  const desktopConfig = join(home, "desktop.json");
  await writeFile(
    desktopConfig,
    JSON.stringify({
      profiles: [
        {
          id: "fixture",
          revision: "v1",
          displayName: "Fixture",
          instructions: "Complete the task",
        },
      ],
    }),
  );
  const backend = new CoreBackend({
    binary: process.env.AREAL_CORE_BIN,
    home: join(home, "desktop"),
    harnessHome: join(home, "registry"),
    userHome: user,
    desktopConfig,
    defaultProfile: { id: "fixture", revision: "v1" },
  });
  const service = new DesktopService(backend, "mobile-fixture");
  t.after(async () => {
    service.remote?.close();
    service.close();
    for (const project of backend.projects.values())
      await project.client?.request("areal/server/drain", { strategy: "cancel" }).catch(() => {});
    await backend.shutdown().catch(() => backend.disconnect());
    model.closeAllConnections();
    await new Promise((resolve) => model.close(resolve));
    await rm(home, { recursive: true, force: true });
  });
  await backend.init();
  const projectIds = [];
  for (const name of ["Mobile project", "Second project"]) {
    const path = join(home, name);
    await mkdir(path);
    projectIds.push(await backend.addProject(path));
  }
  const projectId = projectIds[0];
  const { threadId } = await backend.command("create", { projectId });
  const send = async (text) => {
    const admitted = await backend.command("send", { projectId, threadId, text });
    await waitFor(async () => {
      const value = await backend.projects
        .get(projectId)
        .client.request("thread/read", { threadId, includeTurns: true });
      return (
        value.thread.turns.find((turn) => turn.id === admitted.turn.id)?.status === "completed"
      );
    }, 20000);
  };
  for (let turn = 1; turn <= 52; turn++)
    await send(`MOBILE_HISTORY_${String(turn).padStart(3, "0")}`);
  const encryption = {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => "fixture",
    encryptString: (value) => Buffer.from(value),
    decryptString: (value) => value.toString("utf8"),
  };
  const remote = (service.remote = new RemoteControl(service, encryption));
  await remote.init();
  return { remote, projectIds, threadId, send, backend, modelRequests: () => requests };
}
