// CONV-ACTIVITY-01：连续同一动作的工具合成一段；其他行各自成段，顺序不变。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(new URL("../renderer/package.json", import.meta.url));
const ts = require("typescript");
const source = await readFile(new URL("../renderer/src/conversationPresentation.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { activityRuns, activityRunLabel } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const tool = (id, name, extra = {}) => ({ id, type: "dynamicToolCall", tool: name, status: "completed", success: true, arguments: {}, contentItems: [], ...extra });
const shape = runs => runs.map(run => [run.key, run.items.map(item => item.id)]);

test("contiguous same-action tools merge; a different action starts a new run", () => {
  const rows = [tool("c1", "run_command"), tool("c2", "run_command"), tool("r1", "fs_read"), tool("r2", "read_file"), tool("c3", "run_command")];
  assert.deepEqual(shape(activityRuns(rows)), [["运行命令", ["c1", "c2"]], ["读取文件", ["r1", "r2"]], ["运行命令", ["c3"]]]);
});

test("reasoning groups and breaker rows stay on their own and split runs", () => {
  const spawn = tool("a1", "agent_spawn");
  const rows = [tool("c1", "run_command"), { id: "g1", type: "reasoningGroup", items: [] }, tool("c2", "run_command"), spawn, tool("c3", "run_command")];
  assert.deepEqual(shape(activityRuns(rows, item => item === spawn)), [["运行命令", ["c1"]], [null, ["g1"]], ["运行命令", ["c2"]], [null, ["a1"]], ["运行命令", ["c3"]]]);
});

test("unknown tools merge only with the same tool name", () => {
  const rows = [tool("x1", "lookup_ticket"), tool("x2", "lookup_ticket"), tool("y1", "post_comment")];
  assert.deepEqual(shape(activityRuns(rows)), [["调用 lookup_ticket", ["x1", "x2"]], ["调用 post_comment", ["y1"]]]);
});

test("labels are past-tense verb phrases without counts; running uses the progressive form", () => {
  const done = { key: "运行命令", items: [tool("c1", "run_command"), tool("c2", "run_command")] };
  assert.equal(activityRunLabel(done), "已运行命令");
  const running = { key: "运行命令", items: [tool("c1", "run_command"), tool("c2", "run_command", { status: "inProgress", success: undefined })] };
  assert.equal(activityRunLabel(running), "正在运行命令");
  assert.doesNotMatch(activityRunLabel(done), /\d/);
});
