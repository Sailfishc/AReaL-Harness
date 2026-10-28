import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite-plus";
import { inspectBundle, compareBudget } from "./bundle-budget.mjs";
import { makeTempDir } from "./support/temp.mjs";

const gui = fileURLToPath(new URL("../", import.meta.url));
const evidence = await makeTempDir("areal-ci-budget-counterexample-");
const budget = JSON.parse(await readFile(join(gui, "bundle-budget.json"), "utf8"));
const payload = "CI_BUDGET_CONTRACT_".repeat(65536);
const report = {
  sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: gui, encoding: "utf8" }).trim(),
  node: process.version,
  payloadSha256: createHash("sha256").update(payload).digest("hex"),
  passed: false,
};
let injected = 0;
try {
  const baseline = await inspectBundle(join(gui, "renderer/dist"));
  assert.deepEqual(
    compareBudget(baseline, budget),
    [],
    "counterexample requires a valid production build first",
  );
  const directory = join(evidence, "dist");
  await build({
    root: join(gui, "renderer"),
    configFile: join(gui, "renderer/vite.config.ts"),
    logLevel: "warn",
    build: { outDir: directory, emptyOutDir: true },
    plugins: [
      {
        name: "initial-bundle-counterexample",
        enforce: "pre",
        transform(source, id) {
          if (!id.endsWith("/renderer/src/main.tsx")) return;
          injected++;
          return (
            source + `\nglobalThis.__arealCiBudgetCounterexample = ${JSON.stringify(payload)};\n`
          );
        },
      },
    ],
  });
  assert.equal(injected, 1, "inject exactly once into the real production entry");
  const actual = await inspectBundle(directory);
  report.failures = compareBudget(actual, budget);
  report.initialJsBytes = actual.entries["index.html"].jsBytes;
  report.initialJsBudget = budget.entries["index.html"];
  assert.ok(
    report.failures.some((failure) => failure.startsWith("index.html initial JS ")),
    "the actual production budget checker must reject injected initial JS",
  );
  report.passed = true;
} finally {
  await writeFile(join(evidence, "report.json"), JSON.stringify(report, null, 2) + "\n");
  if (report.passed) await rm(join(evidence, "dist"), { recursive: true });
  console.log(JSON.stringify({ ...report, evidence }));
}
