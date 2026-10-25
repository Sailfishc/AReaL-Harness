"use strict";
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createRequire } = require("node:module");
const { resolve } = require("node:path");
const ts = createRequire(resolve("renderer/package.json"))("typescript");
const { validateCommandResponse } = require("../packages/workbench/client/desktop-contract.cjs");

const cases = [
  [
    "prepareCreator",
    { projectId: "project" },
    {
      projectId: "project",
      profile: { id: "profile", revision: "1" },
      skill: { id: "skill", revision: "1", name: "Creator", description: "" },
      provenance: { upstream: "source", revision: "1", contentDigest: "a".repeat(64) },
    },
    { projectId: "project" },
  ],
  [
    "continue",
    { projectId: "project", threadId: "thread", expectedTurnId: "turn" },
    { queueRevision: 1 },
    { queueRevision: "1" },
  ],
  [
    "fork",
    {
      projectId: "project",
      sourceThreadId: "source",
      workspaceMode: "sharedCurrent",
      anchor: { turnId: "turn", boundary: "before" },
    },
    { threadId: "thread", requestId: "request" },
    { threadId: "thread" },
  ],
  [
    "configure",
    {
      projectId: "project",
      threadId: "thread",
      model: { providerId: "provider", modelId: "model" },
    },
    { projects: [] },
    { projects: {} },
  ],
  [
    "side",
    { projectId: "project", operation: "close", threadId: "thread", requestId: "request" },
    { threadId: "thread", requestId: "request", accepted: true, cleanupConfirmed: false },
    { threadId: "thread", requestId: "request", accepted: true, cleanupConfirmed: "unknown" },
  ],
];

test("five command response type examples agree with runtime rejection", () => {
  for (const [name, params, valid, invalid] of cases) {
    assert.equal(validateCommandResponse(name, params, valid), undefined, name);
    assert.throws(() => validateCommandResponse(name, params, invalid), undefined, name);
  }
});

test("the contract accepts typed examples and rejects invalid requests and responses without suppressions", () => {
  const rows = cases.flatMap(([name, params, valid, invalid], index) => [
    `const request${index}: CommandParams<'${name}'> = ${JSON.stringify(params)};`,
    `const response${index}: CommandResponse<'${name}', typeof request${index}> = ${JSON.stringify(valid)};`,
    `const invalidResponse${index}: CommandResponse<'${name}', typeof request${index}> = ${JSON.stringify(invalid)};`,
  ]);
  const invalidRequests = [
    `const badCreator: CommandParams<'prepareCreator'> = {projectId:'p',profile:{id:'id',revision:1}};`,
    `const badContinue: CommandParams<'continue'> = {projectId:'p',threadId:'t'};`,
    `const badFork: CommandParams<'fork'> = {projectId:'p',sourceThreadId:'t',workspaceMode:'sharedCurrent',anchor:{turnId:'turn',boundary:'middle'}};`,
    `const badConfigure: CommandParams<'configure'> = {projectId:'p',threadId:'t',model:{providerId:'p',modelId:1}};`,
    `const badSide: CommandParams<'side'> = {projectId:'p',operation:'close',threadId:'t'};`,
  ];
  const filename = resolve("scripts/desktop-contract-type-fixture.mts");
  const source = `import type { CommandName, CommandParams, CommandResponse } from '../packages/workbench/client/desktop-contract.cjs';\n${rows.join("\n")}\n${invalidRequests.join("\n")}\nconst known: CommandName = 'fork';\nconst unsupported: CommandResponse<'stop'> = {opaque:true};\n`;
  const options = {
    allowJs: true,
    checkJs: false,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    types: [],
  };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (path, languageVersion, onError, shouldCreateNewSourceFile) =>
    path === filename
      ? ts.createSourceFile(path, source, languageVersion, true)
      : getSourceFile(path, languageVersion, onError, shouldCreateNewSourceFile);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([filename], options, host));
  const expectedLines = [
    ...cases.map((_, index) => 4 + index * 3),
    ...invalidRequests.map((_, index) => 2 + rows.length + index),
  ];
  assert.deepEqual(
    diagnostics.map((item) => ({
      file: item.file?.fileName,
      line:
        item.file && item.start !== undefined
          ? item.file.getLineAndCharacterOfPosition(item.start).line + 1
          : 0,
    })),
    expectedLines.map((line) => ({ file: filename, line })),
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (value) => value,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => "\n",
    }),
  );
});
