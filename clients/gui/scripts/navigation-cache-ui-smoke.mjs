import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite-plus";
import { makeTempDir } from "./support/temp.mjs";

const gui = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(gui, "app/package.json"));
const { chromium } = require("playwright-core");
const baseline = process.argv.includes("--baseline");
const evidence = await makeTempDir("areal-navigation-cache-");
const sources = [
  "renderer/src/App.tsx",
  "renderer/src/state/useSessionNavigation.ts",
  "renderer/src/state/useSidebarNavigation.ts",
  "renderer/test-fixtures/navigation-cache.tsx",
];
const sourceHashes = Object.fromEntries(
  await Promise.all(
    sources.map(async (path) => [
      path,
      createHash("sha256")
        .update(await readFile(join(gui, path)))
        .digest("hex"),
    ]),
  ),
);
const workbench = JSON.parse(await readFile(join(gui, "packages/workbench/package.json"), "utf8"));
const vite = await createServer({
  root: join(gui, "renderer"),
  configFile: join(gui, "renderer/vite.config.ts"),
  mode: "design-system",
  optimizeDeps: {
    include: Object.keys(workbench.exports).map((path) => `@areal/workbench${path.slice(1)}`),
  },
  server: { host: "127.0.0.1", port: 0 },
  plugins: [
    {
      name: "navigation-cache-measurement",
      enforce: "pre",
      transform(source, id) {
        if (id.endsWith("/state/conversationCatalog.ts")) {
          assert.ok(
            source.includes(
              "export function conversationCatalog(projects: Data[], library: Data) {",
            ),
          );
          return source.replace(
            "export function conversationCatalog(projects: Data[], library: Data) {",
            "export function conversationCatalog(projects: Data[], library: Data) { window.navigationCounts.catalog++;",
          );
        }
        if (id.endsWith("/state/useSessionNavigation.ts")) {
          assert.ok(source.includes(".filter((p) => !library.projects?.[p.id]?.hidden)"));
          return source.replace(
            ".filter((p) => !library.projects?.[p.id]?.hidden)",
            ".filter((p) => (window.navigationCounts.projectVisits++, !library.projects?.[p.id]?.hidden))",
          );
        }
        if (id.endsWith("/state/useSidebarNavigation.ts")) {
          assert.ok(source.includes(".sort(compareActivity)"));
          return source.replace(
            ".sort(compareActivity)",
            ".sort((a, b) => (window.navigationCounts.comparisons++, compareActivity(a, b)))",
          );
        }
      },
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (!req.url.startsWith("/__navigation-cache.html")) return next();
          res.setHeader("Content-Type", "text/html");
          res.end(
            await server.transformIndexHtml(
              "/__navigation-cache.html",
              '<html><body style="margin:0"><div id="root"></div><script>window.navigationCounts={catalog:0,projectVisits:0,comparisons:0}</script><script type="module" src="/test-fixtures/navigation-cache.tsx"></script></body></html>',
            ),
          );
        });
      },
    },
  ],
});
let browser;
const errors = [];
const report = {
  baseline,
  passed: false,
  boundary: "real React App in Chrome; fixture PlatformServices; no Core, Electron, or package",
  before: null,
  after: null,
  changes: [],
  errors,
  sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: gui, encoding: "utf8" }).trim(),
  sourceHashes,
  design: {
    interaction: "NAV",
    rules: ["NAV-CONTEXT-01", "NAV-DEFAULT-01", "R-UI-COMMON-005"],
    viewport: { width: 1280, height: 960 },
    theme: "light",
    locale: "zh-CN",
  },
};
try {
  await vite.listen();
  browser = await chromium.launch({
    executablePath:
      process.env.AREAL_CHROMIUM_BIN ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/__navigation-cache.html`);
  await page.getByTestId("task-item-thread-0-39").first().waitFor();
  await page.getByRole("button", { name: "收起侧栏", exact: true }).waitFor();
  report.before = await page.evaluate(() => ({ ...window.navigationCounts }));
  assert.ok(
    report.before.catalog > 0 && report.before.projectVisits > 0 && report.before.comparisons > 0,
    "all production derivations were instrumented",
  );
  for (let index = 0; index < 12; index++) {
    await page
      .getByRole("button", { name: index % 2 ? "展开侧栏" : "收起侧栏", exact: true })
      .click();
    await page
      .getByRole("button", { name: index % 2 ? "收起侧栏" : "展开侧栏", exact: true })
      .waitFor();
  }
  report.after = await page.evaluate(() => ({ ...window.navigationCounts }));
  if (baseline) {
    assert.ok(report.after.catalog > report.before.catalog);
    assert.ok(report.after.projectVisits > report.before.projectVisits);
    assert.ok(report.after.comparisons > report.before.comparisons);
  } else
    assert.deepEqual(
      report.after,
      report.before,
      "local visibility changes reuse the directory derivations",
    );
  for (const kind of ["rename", "unread", "running", "order", "snapshot"]) {
    const previous = await page.evaluate(() => window.navigationCounts.catalog);
    await page.evaluate((kind) => window.navigationFixture.publish(kind), kind);
    await page.waitForFunction((previous) => window.navigationCounts.catalog > previous, previous);
    const row = page.getByTestId("task-item-thread-0-39").first();
    if (kind === "rename") await row.getByText("Renamed conversation", { exact: true }).waitFor();
    if (kind === "unread") assert.equal(await row.getAttribute("data-unread"), "true");
    if (kind === "running") assert.equal(await row.locator(".animate-spin").count(), 1);
    if (kind === "order") {
      const first = await page
        .locator("[data-testid^='task-item-']")
        .first()
        .getAttribute("data-testid");
      assert.ok(first.startsWith("task-item-thread-11-"));
    }
    report.changes.push(kind);
  }
  assert.equal(errors.length, 0);
  assert.equal(
    (await page.evaluate(() => window.navigationFixture.calls)).some((name) =>
      ["send", "create", "steer", "enqueue"].includes(name),
    ),
    false,
  );
  await page.screenshot({ path: join(evidence, "navigation.png") });
  report.passed = true;
} finally {
  await browser?.close();
  await vite.close();
  await writeFile(join(evidence, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, evidence }));
}
