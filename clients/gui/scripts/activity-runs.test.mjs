// CONV-ACTIVITY-01 / CONV-PARALLEL-01：两段文字之间的工具合成一组；子代理开始与完成是各自成段的事件。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(new URL("../renderer/package.json", import.meta.url));
const ts = require("typescript");
const source = await readFile(
  new URL("../renderer/src/conversationPresentation.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { activityRuns, activityRunLabel, toolActionText, toolPresentation } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const tool = (id, name, extra = {}) => ({
  id,
  type: "dynamicToolCall",
  tool: name,
  status: "completed",
  success: true,
  arguments: {},
  contentItems: [],
  ...extra,
});
const shape = (runs) => runs.map((run) => [run.key, run.items.map((item) => item.id)]);

// 标题文字来自界面词条；两种语言都按 react-intl 的真实格式化规则逐条比对。
const messagesSource = await readFile(
  new URL("../renderer/src/i18n/messages/conversation.ts", import.meta.url),
  "utf8",
);
const { conversationMessages } = await import(
  `data:text/javascript;base64,${Buffer.from(
    ts.transpileModule(messagesSource, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText,
  ).toString("base64")}`
);
const { createIntl } = await import(require.resolve("react-intl"));
const locales = ["zh-CN", "en"];
const translators = Object.fromEntries(
  locales.map((locale) => {
    const intl = createIntl({
      locale,
      messages: Object.fromEntries(
        Object.entries(conversationMessages).map(([id, pair]) => [id, pair[locale]]),
      ),
    });
    return [locale, (id, values) => intl.formatMessage({ id }, values)];
  }),
);
const { cases } = JSON.parse(
  await readFile(new URL("../renderer/src/activity-runs.cases.json", import.meta.url), "utf8"),
);

for (const entry of cases)
  test(`CONV-ACTIVITY-01 行为表：${entry.name}`, () => {
    const rows = entry.tools.map(([id, name, args = {}, extra = {}]) =>
      tool(id, name, { arguments: args, ...extra }),
    );
    const runs = activityRuns(rows);
    assert.deepEqual(
      runs.map((run) => run.items.map((item) => item.id)),
      entry.runs.map((run) => run.items),
    );
    for (const locale of locales)
      assert.deepEqual(
        runs.map((run) => activityRunLabel(run, translators[locale])),
        entry.runs.map((run) => run.label[locale]),
        locale,
      );
  });

test("CONV-ACTIVITY-01 行动作跟随界面语言，文件行只给出路径供悬停", () => {
  const read = tool("r1", "fs_read", { arguments: { path: "core/engine/src/sessions.rs" } });
  const command = tool("c1", "run_command", {
    arguments: { command: "git status --short" },
    status: "inProgress",
    success: null,
  });
  assert.equal(toolActionText(read, "done", translators["zh-CN"]), "已读取");
  assert.equal(toolActionText(read, "done", translators.en), "Read");
  assert.equal(toolActionText(command, "running", translators.en), "Running");
  assert.equal(
    toolActionText(tool("x1", "lookup_ticket"), "done", translators.en),
    "Called lookup_ticket",
  );
  assert.equal(toolPresentation(read).path, "core/engine/src/sessions.rs");
  assert.equal(toolPresentation(command).path, undefined);
  assert.equal(toolPresentation(command).state, "running");
});

test("reasoning groups and breaker rows stay on their own and split groups", () => {
  const spawn = tool("a1", "agent_spawn");
  const rows = [
    tool("c1", "run_command"),
    tool("r1", "fs_read"),
    { id: "g1", type: "reasoningGroup", items: [] },
    tool("c2", "run_command"),
    spawn,
    tool("c3", "run_command"),
  ];
  assert.deepEqual(shape(activityRuns(rows, (item) => item === spawn)), [
    ["工具", ["c1", "r1"]],
    [null, ["g1"]],
    ["工具", ["c2"]],
    [null, ["a1"]],
    ["工具", ["c3"]],
  ]);
});

test("a child's finish is drawn only from a settled wait receipt", async () => {
  const { agentSettlements } = await import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
  const receipt = (name, value) =>
    tool("w", name, { contentItems: [{ type: "inputText", text: JSON.stringify(value) }] });
  assert.deepEqual(
    agentSettlements(
      receipt("agent_wait", {
        threadId: "c1",
        status: "completed",
        settled: true,
        timedOut: false,
      }),
    ),
    [{ threadId: "c1", label: "已完成" }],
  );
  assert.deepEqual(
    agentSettlements(
      receipt("agent_wait", {
        threadId: "c1",
        status: "inProgress",
        settled: false,
        timedOut: true,
      }),
    ),
    [],
  );
  assert.deepEqual(
    agentSettlements(
      receipt("agent_wait_any", {
        completed: [
          { threadId: "c1", status: "completed", settled: true },
          { threadId: "c2", status: "cancelled", settled: true },
        ],
        pending: [],
      }),
    ),
    [
      { threadId: "c1", label: "已完成" },
      { threadId: "c2", label: "已中断" },
    ],
  );
  assert.deepEqual(
    agentSettlements(receipt("agent_read", { threadId: "c1", status: "completed", settled: true })),
    [],
    "reading a child is not observing its finish",
  );
  assert.deepEqual(
    agentSettlements({
      ...receipt("agent_wait", { threadId: "c1", status: "completed", settled: true }),
      status: "failed",
      success: false,
    }),
    [],
  );
});
