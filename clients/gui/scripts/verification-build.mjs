import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile, unlink, rmdir, realpath } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

export async function verificationDoctor({ root, binary, evidence }) {
  const report = join(evidence, `startup-${randomUUID()}.json`);
  const result = spawnSync(
    "python3",
    [
      fileURLToPath(new URL("../../../scripts/verification.py", import.meta.url)),
      "--root",
      root,
      "doctor",
      "--core",
      binary,
      "--report",
      report,
    ],
    { encoding: "utf8" },
  );
  if (result.error) throw result.error;
  const diagnostics = JSON.parse(await readFile(report, "utf8"));
  if (result.status !== 0 || !diagnostics.passed)
    throw new Error(
      `Verification preflight failed: ${diagnostics.errors.join("; ")}. Report: ${report}`,
    );
  return diagnostics;
}

export async function lockVerificationSlot(binary) {
  const directory = await realpath(dirname(binary));
  const receipt = JSON.parse(await readFile(join(directory, "verification-build.json"), "utf8"));
  if (receipt.deploymentDirectory !== directory)
    throw new Error("Deploy the matching build to a fixed test slot before verification");
  const lock = join(directory, ".verification-lock");
  await mkdir(lock).catch((error) => {
    if (error.code === "EEXIST")
      throw new Error(`Test slot is in use: ${lock}; inspect its owner before cleanup`);
    throw error;
  });
  const owner = join(lock, "owner.json");
  await writeFile(owner, JSON.stringify({ pid: process.pid }));
  return async () => {
    await unlink(owner);
    await rmdir(lock);
  };
}
