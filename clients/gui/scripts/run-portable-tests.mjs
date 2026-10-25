import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readTestManifest, selectTests } from "./test-manifest.mjs";

const gui = fileURLToPath(new URL("../", import.meta.url));
const manifest = await readTestManifest();
const python = spawnSync("python3", ["--version"], { stdio: "ignore" });
const selected = selectTests(
  manifest.filter((entry) => entry.layer !== "e2e"),
  {
    platform: process.platform,
    available: [
      "git",
      "gui-build",
      `node-${process.versions.node}`,
      ...(python.status === 0 ? ["python3"] : []),
    ],
  },
);
if (!selected.length) throw new Error(`No portable tests registered for ${process.platform}`);
console.log(JSON.stringify({ platform: process.platform, scripts: selected }));
for (const script of selected) {
  const result = spawnSync("pnpm", ["run", script], { cwd: gui, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
