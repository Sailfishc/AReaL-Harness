import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
const gui = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  desktop = join(gui, "app"),
  root = resolve(gui, "../..");
const require = createRequire(join(desktop, "package.json"));
const { _electron: electron } = require("playwright-core");
const binary = process.env.AREAL_CORE_BIN || join(root, "target/debug/areal");
const image = process.env.AREAL_CLOUD_TASK_IMAGE || "areal-cloud-task:local";
const scratch = await mkdtemp("/private/tmp/areal-cloud-gui-"),
  workspace = join(scratch, "workspace");
await mkdir(workspace);
await mkdir(join(scratch, "user-home"));
const git = (...args) =>
  execFileSync("git", ["-C", workspace, ...args], { encoding: "utf8" }).trim();
git("init", "-q");
await writeFile(join(workspace, "code.txt"), "before\n");
await writeFile(join(workspace, ".gitignore"), "private.md\n");
git("add", ".");
git("-c", "user.name=Smoke", "-c", "user.email=smoke@example.invalid", "commit", "-qm", "source");
await writeFile(join(workspace, "private.md"), "PRIVATE_DESIGN_REMAINS_LOCAL");
const initial = git("rev-parse", "HEAD");
const requests = [],
  errors = [],
  checks = [],
  taskIds = [];
let release,
  held = false;
let gate = new Promise((r) => {
  release = r;
});
const secret = "public-fixture-provider-key";
const server = createServer(async (req, res) => {
  try {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const request = JSON.parse(raw);
    requests.push(request);
    assert.equal(req.headers.authorization, "Bearer " + secret);
    const text = JSON.stringify(request.messages);
    if (text.includes("GUI_HOLD")) {
      held = true;
      await gate;
    }
    const count = request.messages.filter((m) => m.role === "tool").length;
    const steps = [
      ["read_file", { path: "code.txt" }],
      [
        "fs_apply_patches",
        { path: "code.txt", patches: [{ oldText: "before", newText: "after" }] },
      ],
      ["run_command", { command: "printf 'generated\\n' > generated.txt" }],
    ];
    const step = text.includes("CANCEL_GUI") ? null : steps[count];
    const delta = step
      ? {
          tool_calls: [
            {
              index: 0,
              id: "c" + count,
              type: "function",
              function: { name: step[0], arguments: JSON.stringify(step[1]) },
            },
          ],
        }
      : { content: "GUI_DOCKER_DONE" };
    const payload = {
      choices: [{ index: 0, delta, finish_reason: step ? "tool_calls" : "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 20 },
    };
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.end("data: " + JSON.stringify(payload) + "\n\ndata: [DONE]\n\n");
  } catch (error) {
    if (!res.destroyed) {
      errors.push(error.message);
      res.writeHead(400);
      res.end();
    }
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const config = join(scratch, "model.toml");
await writeFile(
  config,
  `schema_version=1\n[model]\nname='fixture'\nmax_retries=0\n[model.providers.default]\nprotocol='chat-completions'\nendpoint='http://127.0.0.1:${server.address().port}/v1/chat/completions'\napi_key_env='AREAL_CLOUD_GUI_TEST_KEY'\n`,
);
const env = {
  ...process.env,
  AREAL_CORE_BIN: binary,
  AREAL_CORE_HOME: join(scratch, "core"),
  AREAL_CORE_USER_HOME: join(scratch, "user-home"),
  AREAL_HARNESS_HOME: join(scratch, "harness"),
  AREAL_HARNESS_SERVICE_HOME: join(scratch, "registry"),
  AREAL_CORE_CONFIG: config,
  AREAL_GUI_USER_DATA: join(scratch, "electron"),
  AREAL_CLOUD_TASK_IMAGE: image,
  AREAL_CLOUD_GUI_TEST_KEY: secret,
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.AREAL_CORE_WORKSPACE;
let app,
  page,
  pid,
  passed = false;
const report = {
  realElectron: true,
  realDocker: true,
  realCoreRuntime: true,
  realModel: false,
  checks,
  errors,
  scratch,
};
const button = (name) => page.getByRole("button", { name, exact: true });
const state = () => page.evaluate(() => window.arealDesktop.snapshot());
const call = async (name, params) => {
  const r = await page.evaluate(
    async ({ name, params }) => window.arealDesktop.command(name, params),
    { name, params },
  );
  if (!r.ok) throw Object.assign(Error(r.error.message), r.error);
  return r.value;
};
async function until(fn, label, seconds = 60) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("timeout: " + label);
}
async function launch() {
  app = await electron.launch({
    executablePath: process.env.AREAL_GUI_ELECTRON || require("electron"),
    args: [desktop],
    env,
    timeout: 120000,
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByTestId("areal-workbench").waitFor({ timeout: 120000 });
  await app.evaluate(({ BrowserWindow, dialog }) => {
    BrowserWindow.getAllWindows()[0].setSize(1440, 960);
    dialog.showMessageBox = async () => ({ response: 1 });
  });
}
async function close() {
  if (!app) return;
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1 });
  });
  await app.close();
  app = null;
}
async function openCloud() {
  await page.locator(`[data-sidebar-project="${pid}"]`).hover();
  await page.getByRole("button", { name: /项目操作/ }).click();
  await page.getByRole("menuitem", { name: "独立环境任务", exact: true }).click();
  await page.getByTestId("cloud-task-dialog").waitFor();
}
async function cloudTasks() {
  return (await call("cloudTask", { projectId: pid, operation: "list" })).tasks;
}
console.log("Cloud GUI evidence:", scratch, "driver PID:", process.pid);
try {
  await launch();
  await app.evaluate(({ dialog }, workspace) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [workspace] });
  }, workspace);
  await button("不在项目中工作").click();
  await page.getByRole("menuitem", { name: "新建项目", exact: true }).click();
  await until(async () => {
    const s = await state();
    pid = s.projects[0]?.id;
    return s.projects[0]?.state?.connected;
  }, "project ready");
  await page
    .getByTestId("chat-input")
    .fill("GUI_HOLD read code.txt, change before to after and create generated.txt.");
  await button("添加功能与 Skills").click();
  await page.getByRole("option", { name: /独立环境任务/ }).click();
  await page.getByTestId("cloud-task-dialog").waitFor();
  assert.equal(
    await page.getByLabel("独立任务内容").inputValue(),
    "GUI_HOLD read code.txt, change before to after and create generated.txt.",
  );
  checks.push("composer entry carries task intent without creating a local thread");
  await page
    .getByLabel("独立任务内容")
    .fill("GUI_HOLD read code.txt, change before to after and create generated.txt.");
  await page
    .getByLabel("独立任务测试命令")
    .fill(
      'test "$(cat code.txt)" = after && test "$(cat generated.txt)" = generated && test ! -e /var/run/docker.sock && test ! -w /task/input/request.json',
    );
  await writeFile(join(workspace, "untracked.ts"), "local");
  await button("预览发送计划").click();
  await page.getByRole("alert").filter({ hasText: "未提交代码" }).waitFor();
  assert.equal((await cloudTasks()).length, 0);
  await unlink(join(workspace, "untracked.ts"));
  await button("预览发送计划").click();
  await page.getByTestId("cloud-task-plan").waitFor();
  assert.match(
    await page.getByTestId("cloud-task-plan").innerText(),
    new RegExp(initial.slice(0, 12)),
  );
  assert.match(await page.getByTestId("cloud-task-plan").innerText(), /本机 Docker/);
  await page.getByText(/发送 2 个文件/).click();
  assert.equal(
    await page.getByTestId("cloud-task-plan").getByText("private.md", { exact: true }).count(),
    0,
  );
  await page.screenshot({ path: join(scratch, "plan.png"), animations: "disabled" });
  checks.push("dirty/untracked rejected; ignored design absent; SHA/location/file plan shown");
  let staleRejected = false;
  try {
    execFileSync(
      binary,
      [
        "cloud-task",
        "--store",
        join(scratch, "core/cloud-tasks"),
        "submit",
        "--workspace",
        workspace,
        "--image",
        image,
        "--prompt",
        "stale preview",
        "--config",
        config,
        "--request-id",
        randomUUID(),
        "--expected-plan",
        "0".repeat(64),
      ],
      { env, stdio: "pipe" },
    );
  } catch (error) {
    staleRejected = String(error.stderr).includes("发送计划已变化");
  }
  assert.ok(staleRejected);
  assert.equal((await cloudTasks()).length, 0);
  checks.push("real CLI rejects stale plan before admission");
  await button("创建独立任务").click();
  await until(async () => held, "real model request");
  const task = (await cloudTasks())[0];
  taskIds.push(task.id);
  assert.equal((await cloudTasks()).length, 1);
  const same = await call("cloudTask", {
    projectId: pid,
    operation: "submit",
    planId: task.requestId,
    requestId: task.requestId,
  });
  assert.equal(same.id, task.id);
  const source = await readFile(join(scratch, "core/cloud-tasks", task.id, "source.tar"));
  assert.equal(source.includes(Buffer.from("PRIVATE_DESIGN_REMAINS_LOCAL")), false);
  await page.getByTestId("cloud-task-phase").filter({ hasText: "运行中" }).waitFor();
  await close();
  assert.ok(
    JSON.parse(
      execFileSync("docker", ["inspect", "areal-cloud-" + task.id], { encoding: "utf8" }),
    )[0].State.Running,
  );
  await launch();
  await until(async () => !!(await state()).projects[0]?.state?.connected, "reopen");
  await openCloud();
  await page.getByTestId("cloud-task-phase").filter({ hasText: "运行中" }).waitFor();
  release();
  await page
    .getByTestId("cloud-task-phase")
    .filter({ hasText: "结果可取 · 已清理" })
    .waitFor({ timeout: 60000 });
  checks.push("single admission; GUI exit/reopen preserves container; event recovery");
  await page.getByText(/进度记录/).click();
  await page
    .getByTestId("cloud-task-events")
    .getByText(/Results ready/)
    .waitFor();
  await button("审阅结果").click();
  await page.getByTestId("cloud-task-review").waitFor();
  assert.match(await page.getByTestId("cloud-task-review").innerText(), /测试通过/);
  assert.equal(await page.locator("[data-diff-viewer]").count(), 2);
  await page.screenshot({ path: join(scratch, "review.png"), animations: "disabled" });
  await button("下载结果").click();
  await page.getByRole("status").filter({ hasText: "已校验并保存" }).waitFor();
  await writeFile(join(workspace, "code.txt"), "local conflict\n");
  await button("应用到当前工作区").click();
  await button("确认应用").click();
  await page.getByRole("alert").filter({ hasText: "本地改动" }).waitFor();
  assert.equal(await readFile(join(workspace, "code.txt"), "utf8"), "local conflict\n");
  await writeFile(join(workspace, "code.txt"), "before\n");
  await button("确认应用").click();
  await page.getByRole("status").filter({ hasText: "已应用到当前工作区" }).waitFor();
  assert.equal(await readFile(join(workspace, "code.txt"), "utf8"), "after\n");
  assert.equal(await readFile(join(workspace, "generated.txt"), "utf8"), "generated\n");
  checks.push(
    "verified download; shared DiffViewer; actual test report; conflict rejected; explicit apply",
  );
  git("add", ".");
  git(
    "-c",
    "user.name=Smoke",
    "-c",
    "user.email=smoke@example.invalid",
    "commit",
    "-qm",
    "applied",
  );
  held = false;
  gate = new Promise((r) => {
    release = r;
  });
  await page
    .getByTestId("cloud-task-dialog")
    .getByRole("button", { name: "新任务", exact: true })
    .click();
  await page.getByLabel("独立任务内容").fill("GUI_HOLD CANCEL_GUI");
  await page.getByLabel("独立任务测试命令").fill("");
  await button("预览发送计划").click();
  await page.getByTestId("cloud-task-plan").waitFor();
  await button("创建独立任务").click();
  await until(async () => held, "cancel request");
  const cancelTask = (await cloudTasks()).find((t) => t.prompt.includes("CANCEL_GUI"));
  taskIds.push(cancelTask.id);
  await button("取消任务").click();
  assert.ok(
    JSON.parse(
      execFileSync("docker", ["inspect", "areal-cloud-" + cancelTask.id], { encoding: "utf8" }),
    )[0].State.Running,
  );
  await button("确认停止").click();
  await page
    .getByTestId("cloud-task-phase")
    .filter({ hasText: "已停止" })
    .waitFor({ timeout: 60000 });
  release();
  for (const kind of ["container", "volume"]) {
    let absent = false;
    try {
      execFileSync("docker", [kind, "inspect", "areal-cloud-" + cancelTask.id], { stdio: "pipe" });
    } catch (e) {
      absent = /No such container|no such volume/.test(String(e.stderr));
    }
    assert.ok(absent);
  }
  await page.screenshot({ path: join(scratch, "cancelled.png"), animations: "disabled" });
  checks.push(
    "cancel requires confirmation; actual container/volume deletion; cancelled shown only after cleanup",
  );
  assert.deepEqual(errors, []);
  report.tasks = await cloudTasks();
  report.modelRequests = requests.length;
  report.imageId = JSON.parse(
    execFileSync("docker", ["image", "inspect", image], { encoding: "utf8" }),
  )[0].Id;
  report.cliBuildInfo = JSON.parse(execFileSync(binary, ["build-info"], { encoding: "utf8" }));
  passed = true;
} catch (error) {
  report.error = error.message;
  if (page) await page.screenshot({ path: join(scratch, "failure.png") }).catch(() => {});
  throw error;
} finally {
  release?.();
  if (app && pid) {
    for (const id of taskIds) {
      await call("cloudTask", { projectId: pid, operation: "cancel", id }).catch(() => {});
    }
    await until(
      async () =>
        !(await cloudTasks()).some((t) => !["ready", "cancelled", "failed"].includes(t.phase)),
      "fixture cleanup",
    ).catch(() => {});
    await call("stopService", {}).catch((e) => {
      report.cleanupError = e.message;
    });
  }
  await close().catch(() => {});
  await new Promise((r) => server.close(r));
  report.passed = passed;
  report.codeSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  report.cliSha256 = createHash("sha256")
    .update(await readFile(binary))
    .digest("hex");
  await writeFile(join(scratch, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
