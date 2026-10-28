import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readTestManifest, selectTests } from "./test-manifest.mjs";

const gui = fileURLToPath(new URL("../", import.meta.url));
const manifest = await readTestManifest();
const coreContracts = process.argv.includes("--core-contracts");
const coreAvailable =
  !!process.env.AREAL_CORE_BIN &&
  spawnSync(process.env.AREAL_CORE_BIN, ["build-info"], { stdio: "ignore" }).status === 0;
if (coreContracts && !coreAvailable)
  throw new Error("Core contracts require AREAL_CORE_BIN pointing to the matching executable");
const available = [
  "gui-build",
  ...(coreAvailable ? ["core-binary"] : []),
  `node-${process.versions.node}`,
  ...["git", "python3", "openssl"].filter(
    (command) =>
      spawnSync(command, [command === "openssl" ? "version" : "--version"], { stdio: "ignore" })
        .status === 0,
  ),
];
const selected = selectTests(
  manifest.filter(
    (entry) => entry.layer !== "e2e" && (!coreContracts || entry.requires.includes("core-binary")),
  ),
  { platform: process.platform, available },
);
if (!selected.length) throw new Error(`No portable tests registered for ${process.platform}`);
const mode = coreContracts ? "core-contracts" : "portable";
const runId = randomUUID();
const output = resolve(
  process.env.AREAL_PORTABLE_TEST_REPORT ??
    resolve(gui, `../../target/ci/gui/${mode}/${runId}/report.json`),
);
await mkdir(dirname(output), { recursive: true });
const report = {
  schemaVersion: 1,
  mode,
  runId,
  sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: gui }).toString().trim(),
  trackedDiffSha256: createHash("sha256")
    .update(
      execFileSync("git", ["diff", "HEAD", "--binary", "--no-ext-diff", "--no-textconv"], {
        cwd: gui,
      }),
    )
    .digest("hex"),
  ciRunId: process.env.GITHUB_RUN_ID ?? null,
  ciAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
  coreSha256: coreAvailable
    ? createHash("sha256")
        .update(await readFile(process.env.AREAL_CORE_BIN))
        .digest("hex")
    : null,
  status: "running",
  platform: process.platform,
  node: process.version,
  startedAt: new Date().toISOString(),
  available,
  scripts: selected,
  excluded: manifest
    .filter((entry) => entry.layer !== "e2e" && !selected.includes(entry.script))
    .map((entry) => ({
      script: entry.script,
      platformSupported: entry.platforms.includes(process.platform),
      missingRequirements: entry.requires.filter((requirement) => !available.includes(requirement)),
    })),
  results: [],
};
const started = performance.now();
const saveReport = async () => {
  await writeFile(`${output}.tmp`, JSON.stringify(report, null, 2) + "\n");
  await rename(`${output}.tmp`, output);
};
await saveReport();
console.log(JSON.stringify(report));
for (const script of selected) {
  const began = performance.now();
  const result = spawnSync("pnpm", ["run", script], { cwd: gui, stdio: "inherit" });
  report.results.push({
    script,
    passed: result.status === 0 && !result.error,
    exitCode: result.status,
    signal: result.signal,
    error: result.error?.message,
    elapsedMs: Math.round(performance.now() - began),
  });
  report.elapsedMs = Math.round(performance.now() - started);
  report.passed =
    report.results.length === selected.length && report.results.every((result) => result.passed);
  report.status =
    report.results.length < selected.length ? "running" : report.passed ? "passed" : "failed";
  await saveReport();
  if (result.status !== 0 || result.error) process.exitCode = 1;
}
console.log(JSON.stringify({ report: output, passed: report.passed, elapsedMs: report.elapsedMs }));
