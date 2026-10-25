import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const gui = fileURLToPath(new URL("../", import.meta.url));
const layers = ["unit", "contract", "e2e"];
const platforms = ["darwin", "linux", "win32"];

export async function readTestManifest(root = gui) {
  const manifest = JSON.parse(await readFile(resolve(root, "scripts/test-manifest.json"), "utf8"));
  const scripts = Object.keys(
    JSON.parse(await readFile(resolve(root, "package.json"), "utf8")).scripts ?? {},
  ).filter((name) => name.startsWith("test:"));
  if (!Array.isArray(manifest)) throw new Error("Test manifest must be an array");
  const seen = new Set();
  for (const entry of manifest) {
    if (!entry || typeof entry.script !== "string")
      throw new Error("Manifest entry requires script");
    if (seen.has(entry.script)) throw new Error(`Duplicate test registration ${entry.script}`);
    seen.add(entry.script);
    if (!scripts.includes(entry.script)) throw new Error(`Stale test registration ${entry.script}`);
    if (!layers.includes(entry.layer)) throw new Error(`${entry.script} has invalid layer`);
    for (const key of ["platforms", "areas", "requires"]) {
      if (
        !Array.isArray(entry[key]) ||
        !entry[key].every((value) => typeof value === "string" && value.length > 0) ||
        new Set(entry[key]).size !== entry[key].length
      )
        throw new Error(`${entry.script} has invalid ${key}`);
      if (key !== "requires" && !entry[key].length)
        throw new Error(`${entry.script} requires ${key}`);
    }
    if (!entry.platforms.every((platform) => platforms.includes(platform)))
      throw new Error(`${entry.script} has invalid platforms`);
    if (entry.flaky !== undefined && typeof entry.flaky !== "boolean")
      throw new Error(`${entry.script} has invalid flaky`);
  }
  const missing = scripts.filter((script) => !seen.has(script));
  if (missing.length) throw new Error(`Unregistered tests ${missing.join(", ")}`);
  return manifest;
}

export function selectTests(manifest, { platform, layer, areas = [], available = [] } = {}) {
  if (platform && !platforms.includes(platform)) throw new Error(`Invalid platform ${platform}`);
  if (layer && !layers.includes(layer)) throw new Error(`Invalid layer ${layer}`);
  return manifest
    .filter(
      (entry) =>
        (!platform || entry.platforms.includes(platform)) &&
        (!layer || entry.layer === layer) &&
        (!areas.length || entry.areas.some((area) => areas.includes(area))) &&
        entry.requires.every((requirement) => available.includes(requirement)),
    )
    .map((entry) => entry.script);
}

async function main() {
  const args = process.argv.slice(2);
  const value = (name) => args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
  const rootIndex = args.indexOf("--root");
  const root = resolve(value("--root") ?? (rootIndex >= 0 ? args[rootIndex + 1] : gui));
  const manifest = await readTestManifest(root);
  if (!args.includes("--list")) {
    console.log(
      JSON.stringify({
        passed: true,
        scope: "GUI root package.json test:* scripts",
        registered: manifest.length,
      }),
    );
    return;
  }
  console.log(
    JSON.stringify({
      scripts: selectTests(manifest, {
        platform: value("--platform"),
        layer: value("--layer"),
        areas: value("--area")?.split(","),
        available: value("--available")?.split(","),
      }),
    }),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
