import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const inputs = () =>
  JSON.parse(
    execFileSync("python3", [join(root, "scripts/verification.py"), "gui-inputs"], {
      encoding: "utf8",
    }),
  );

export function bundleAnalysis() {
  let source;
  return {
    name: "areal-bundle-analysis",
    apply: "build",
    buildStart() {
      source = inputs();
    },
    async writeBundle(options, bundle) {
      if (inputs().inputHash !== source.inputHash)
        throw new Error("GUI source changed during build; rebuild a frozen checkout");
      const files = {};
      for (const name of Object.keys(bundle).sort())
        files[name] = createHash("sha256")
          .update(await readFile(join(options.dir, name)))
          .digest("hex");
      await writeFile(
        join(options.dir, "verification-build.json"),
        JSON.stringify({ schemaVersion: 1, ...source, files }, null, 2) + "\n",
      );
    },
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        const chunks = Object.fromEntries(
          Object.entries(bundle)
            .filter(([, output]) => output.type === "chunk")
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([file, chunk]) => [
              file,
              {
                name: chunk.name,
                imports: chunk.imports,
                dynamicImports: chunk.dynamicImports,
                modules: Object.keys(chunk.modules)
                  .map((module) => module.replaceAll("\\", "/").replace(/^.*\/clients\/gui\//, ""))
                  .sort(),
                sha256: createHash("sha256").update(chunk.code).digest("hex"),
              },
            ]),
        );
        this.emitFile({
          type: "asset",
          fileName: "bundle-analysis.json",
          source: JSON.stringify({ schemaVersion: 1, chunks }, null, 2) + "\n",
        });
      },
    },
  };
}
