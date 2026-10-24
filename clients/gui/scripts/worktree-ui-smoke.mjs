import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile, mkdtemp, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  createServer,
  transformWithEsbuild,
} from "../renderer/node_modules/vite/dist/node/index.js";
const gui = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(gui, "app/package.json"));
const { chromium } = require("playwright-core");
const evidence = process.env.AREAL_WORKTREE_UI_EVIDENCE || (await mkdtemp("/tmp/aw-ui-"));
await mkdir(evidence, { recursive: true });
const entry = `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ApplicationIntlProvider} from '/src/i18n/IntlProvider.tsx';
import {useAppearance} from '/src/settings/applicationPreferences.ts';
import {WorktreeStarter} from '/src/WorktreeStarter.tsx';
import {WorktreeStatus} from '/src/WorktreeStatus.tsx';
import {DraftComposer} from '/src/DraftComposer.tsx';
import '/src/styles.css';
window.fixtureCalls=[];
window.fixtureRecovery=location.search.includes('recovery');
if(window.fixtureRecovery){localStorage.setItem('fixture-draft','retain this input');localStorage.setItem('fixture-draft:pending-create','00000000-0000-4000-a000-000000000001');localStorage.setItem('fixture-draft:pending-create-request',JSON.stringify({projectId:'logical',requestId:'00000000-0000-4000-a000-000000000001',worktree:{ref:'main'}}));}
const action=async(name,params)=>{window.fixtureCalls.push({name,params});if(window.fixtureRecovery)throw Object.assign(new Error('Original request still uncertain'),{submissionUnknown:true,requestId:params.requestId});if(window.fixtureFail)throw new Error('Fixture directory unavailable');
 await new Promise(resolve=>setTimeout(resolve,30));
 if(params.operation==='worktreeOptions')return {worktrees:[{root:'/fixture/source',branch:'main',head:'a'.repeat(40)},{root:'/fixture/existing',branch:'feature/source',head:'b'.repeat(40)}],branches:params.sourceRoot==='/fixture/existing'?['feature/source','release']:['main','release'],settings:{worktreeRoot:'',branchPrefix:'areal'},environments:[{id:'dev',name:'Development',setup:{default:'echo setup'},cleanup:{default:''},actions:[]}],environmentRevision:1};
 return {worktreeRoot:params.worktreeRoot,branchPrefix:params.branchPrefix};};
function Fixture(){useAppearance(false);const [selection,setSelection]=useState();const [events,setEvents]=useState([]);const [current,setCurrent]=useState();
 window.updateEvents=(value,ready)=>{setEvents(value);setCurrent(ready);};
 if(window.fixtureRecovery)return <main className='p-6'><DraftComposer project={{id:'logical',root:'/fixture/source',models:[],profiles:[],pending:[],outcomes:{},state:{connected:false},mcpServers:[]}} draftKey='fixture-draft' action={action} onOpen={async()=>{}} onPanel={()=>{}} /></main>;
 return <main className='mx-auto max-w-2xl p-6'><h1>Worktree production components</h1><WorktreeStarter project={{id:'logical',root:'/fixture/source',state:{connected:true}}} action={action} value={selection} onChange={value=>{window.fixtureSelection=value;setSelection(value);}}/><WorktreeStatus events={events} current={current}/></main>;}
createRoot(document.getElementById('root')).render(<ApplicationIntlProvider><Fixture/></ApplicationIntlProvider>);
`;
const virtual = "\0worktree-fixture.tsx";
const vite = await createServer({
  root: join(gui, "renderer"),
  configFile: join(gui, "renderer/vite.config.ts"),
  mode: "design-system",
  server: { host: "127.0.0.1", port: 0 },
  plugins: [
    {
      name: "worktree-production-fixture",
      resolveId(id) {
        if (id === "/worktree-fixture.tsx") return virtual;
      },
      async load(id) {
        if (id === virtual)
          return transformWithEsbuild(entry, "worktree-fixture.tsx", {
            loader: "tsx",
            jsx: "automatic",
          });
      },
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url?.split("?")[0] !== "/__worktree_fixture.html") return next();
          try {
            const html = await server.transformIndexHtml(
              "/__worktree_fixture.html",
              '<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/worktree-fixture.tsx"></script></body></html>',
            );
            res.setHeader("Content-Type", "text/html");
            res.end(html);
          } catch (error) {
            next(error);
          }
        });
      },
    },
  ],
});
let browser,
  passed = false;
const checks = [],
  frames = [],
  errors = [];
try {
  await vite.listen();
  browser = await chromium.launch({
    executablePath: process.env.AREAL_CHROMIUM_BIN || "/usr/bin/chromium",
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1100, height: 850 },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/__worktree_fixture.html`);
  await page.getByRole("button", { name: "新会话工作区" }).click();
  await page.getByRole("switch", { name: "在新 Worktree 中工作", exact: true }).click();
  await page.getByRole("button", { name: "起始分支", exact: true }).click();
  await page.getByRole("searchbox", { name: "搜索分支", exact: true }).fill("release");
  await page.getByRole("option", { name: "release", exact: true }).click();
  await page.getByLabel("项目环境", { exact: true }).click();
  await page.getByRole("option", { name: "Development", exact: true }).click();
  const capture = async (name) => {
    const path = join(evidence, name + ".png");
    await page.screenshot({ path, fullPage: true, animations: "disabled" });
    frames.push({
      path,
      sha256: createHash("sha256")
        .update(await readFile(path))
        .digest("hex"),
    });
  };
  await capture("picker-configured");
  await page.keyboard.press("Escape");
  assert.deepEqual(await page.evaluate(() => window.fixtureSelection), {
    sourceRoot: "/fixture/source", ref: "release", worktreeRoot: "", branch: "", branchPrefix: "areal",
    mode: "worktree", environmentId: "dev", environmentRevision: 1,
  });
  const calls = await page.evaluate(() => window.fixtureCalls);
  assert.equal(calls.some(call => ["worktreeCreate", "worktreeOpen"].includes(call.params.operation)), false,
    "configuration must not create before first send");
  checks.push("production gear popover toggles worktree creation, searches branches and selects a project environment without creating before send");
  for (const state of ["creating", "created", "binding", "settingUp", "cancelling", "cancelled", "ready", "failed", "unknown"]) {
    await page.evaluate(
      (state) =>
        window.updateEvents(
          [
            {
              id: state,
              state,
              message: state === "failed" ? "Fixture creation failed" : undefined,
            },
          ],
          ["ready", "failed"].includes(state)
            ? {
                state,
                directory: "/fixture/new-trees/task-proof",
                branch: "areal/gui-proof",
                automatic: true,
              }
            : undefined,
        ),
      state,
    );
    await page.locator(`[data-worktree-state="${state}"]`).waitFor();
    if (state === "ready") {
      await page.getByRole("button", { name: "查看创建详情", exact: true }).click();
      await page.getByText("areal/gui-proof", { exact: true }).waitFor();
      await page.getByText("/fixture/new-trees/task-proof", { exact: true }).waitFor();
    }
    if (state === "failed") {
      await page.getByRole("alert").getByText("Fixture creation failed").waitFor();
      await page.getByText("/fixture/new-trees/task-proof", { exact: true }).waitFor();
    }
    await capture("state-" + state);
  }
  checks.push(
    "actual production status component presents creating, created, binding, ready, failed and unknown host facts with branch and directory",
  );
  await page.evaluate(() => {
    window.fixtureFail = true;
  });
  await page.getByRole("button", { name: "新会话工作区" }).click();
  await page.getByRole("alert").getByText("Fixture directory unavailable").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  checks.push("source-query failure preserves a visible error and an accessible return path");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    window.fixtureFail = false;
  });
  await page.getByRole("button", { name: "新会话工作区" }).click();
  await page.getByRole("switch", { name: "在新 Worktree 中工作", exact: true }).waitFor();
  assert.ok(
    await page
      .getByRole("dialog")
      .evaluate((element) => element.getBoundingClientRect().right <= window.innerWidth + 1),
  );
  await capture("picker-narrow");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  checks.push("390px dialog remains within viewport and Escape returns to the conversation");
  await page.goto(
    `http://127.0.0.1:${vite.httpServer.address().port}/__worktree_fixture.html?recovery=1`,
  );
  await page.getByRole("button", { name: "检查操作状态", exact: true }).click();
  const recover = page.getByRole("button", { name: "保留原结果，返回草稿", exact: true });
  await recover.waitFor();
  page.once("dialog", (dialog) => dialog.dismiss());
  await recover.click();
  assert.notEqual(
    await page.evaluate(() => localStorage.getItem("fixture-draft:pending-create")),
    null,
  );
  page.once("dialog", (dialog) => dialog.accept());
  await recover.click();
  assert.equal(
    await page.evaluate(() => localStorage.getItem("fixture-draft:pending-create")),
    null,
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem("fixture-draft")),
    "retain this input",
  );
  assert.ok(
    await page.evaluate(() =>
      localStorage.getItem("fixture-draft:retained-create:00000000-0000-4000-a000-000000000001"),
    ),
  );
  const recoveryCalls = await page.evaluate(() => window.fixtureCalls);
  assert.equal(recoveryCalls.filter((call) => call.name === "create").length, 0);
  assert.deepEqual(recoveryCalls.find((call) => call.params.operation === "worktreeRead").params, {
    projectId: "logical", operation: "worktreeRead",
    requestId: "00000000-0000-4000-a000-000000000001",
  });
  assert.equal(
    recoveryCalls.some((call) => call.name === "send"),
    false,
  );
  checks.push(
    "production DraftComposer checks the original UUID before explicit manual recovery, preserves draft and archived request, and never resends or sends the uncertain draft",
  );
  assert.deepEqual(errors, []);
  passed = true;
} finally {
  await browser?.close();
  await vite.close();
  const manifest = {
    passed,
    checks,
    errors,
    frames,
    platform: process.platform,
    scope:
      "headless Chromium production React components with deterministic desktop action fixture",
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: resolve(gui, "../.."),
      encoding: "utf8",
    }).trim(),
    unverified: [
      "full App and Electron native integration",
      "macOS Electron",
      "dark theme and font-size matrix",
      "Codex pixel comparison",
    ],
  };
  await writeFile(join(evidence, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ passed, evidence, checks, errors }, null, 2));
}
