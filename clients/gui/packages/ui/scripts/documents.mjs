import assert from "node:assert/strict";
import { readFile, readdir, mkdir, copyFile } from "node:fs/promises";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { root, writeOrCheck } from "./foundations.mjs";

async function files(path) {
  const entries = await readdir(path, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(resolve(path, entry.name)) : resolve(path, entry.name)))).flat();
}
function exported(source) {
  const file = ts.createSourceFile("entry.ts", source, ts.ScriptTarget.Latest, true);
  return new Set(file.statements.filter(ts.isExportDeclaration).flatMap(item => item.exportClause && ts.isNamedExports(item.exportClause) ? item.exportClause.elements.map(element => element.name.text) : []));
}
// Contract metadata is a small YAML-compatible subset: scalars and inline JSON arrays.
export function parseComponentMetadata(markdown, path) {
  const front = markdown.match(/^---\n([\s\S]+?)\n---\n/);
  assert.ok(front, `missing component metadata: ${path}`);
  const data = Object.fromEntries(front[1].split("\n").map(line => line.split(/: (.*)/s).slice(0, 2)));
  for (const key of ["id", "title", "summary", "status", "entry", "layer", "category"]) assert.ok(data[key]?.trim(), `missing ${key}: ${path}`);
  for (const key of ["aliases", "related"]) {
    assert.ok(data[key], `missing ${key}: ${path}`);
    data[key] = JSON.parse(data[key]);
    assert.ok(Array.isArray(data[key]) && data[key].every(value => typeof value === "string"), `invalid ${key}: ${path}`);
  }
  for (const section of ["何时使用", "组成", "状态", "行为", "内容", "可访问性", "规则", "示例"])
    assert.ok(markdown.includes(`\n## ${section}\n`), `missing section ${section}: ${path}`);
  return data;
}
export async function buildDocuments(check = false) {
  const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  assert.equal(pkg.private, true, "workspace UI package stays private");
  const srcFiles = await files(resolve(root, "src"));
  const entries = Object.fromEntries(await Promise.all(["index", "wip"].map(async name => [name, exported(await readFile(resolve(root, `src/${name}.ts`), "utf8"))])));
  for (const path of srcFiles.filter(path => /\.[jt]sx?$/.test(path))) {
    const source = ts.createSourceFile(path, await readFile(path, "utf8"), ts.ScriptTarget.Latest, true);
    const specifiers = source.statements.filter(node => ts.isImportDeclaration(node) || ts.isExportDeclaration(node)).map(node => node.moduleSpecifier?.text).filter(Boolean);
    for (const name of specifiers) {
      assert.ok(!/(?:renderer|app\/src|electron|^node:|^fs$|^path$|collaboration)/.test(name), `UI reverse/platform dependency: ${relative(root, path)} -> ${name}`);
      if (name.startsWith(".")) {
        const target = resolve(dirname(path), name);
        assert.ok(target.startsWith(resolve(root, "src") + "/"), `import escapes UI: ${name}`);
        if (path.startsWith(resolve(root, "src/components") + "/") || path === resolve(root, "src/index.ts"))
          assert.ok(!target.startsWith(resolve(root, "src/conversation") + "/"), `core imports conversation: ${relative(root, path)} -> ${name}`);
      }
    }
  }
  const components = [];
  for (const path of srcFiles.filter(path => path.endsWith(".md"))) {
    const markdown = await readFile(path, "utf8");
    const data = parseComponentMetadata(markdown, path);
    assert.ok(/^[a-z][a-z-]+$/.test(data.id));
    assert.ok(["core", "conversation"].includes(data.layer), `unknown layer: ${path}`);
    assert.equal(data.layer, path.includes("/src/conversation/") ? "conversation" : "core", `layer/source mismatch: ${path}`);
    if (data.layer === "conversation") assert.equal(data.entry, "wip", "conversation components remain experimental");
    assert.equal(data.status, data.entry === "index" ? "stable" : "experimental", `status/entry mismatch: ${path}`);
    assert.ok(entries[data.entry]?.has(data.title), `documented export does not exist: ${data.title}`);
    const source = relative(root, path).replace(/\.md$/, ".tsx");
    const declaration = source.replace(/^src\//, "dist/").replace(/\.tsx$/, ".d.ts");
    const api = await readFile(resolve(root, declaration), "utf8");
    const document = `clients/gui/packages/ui/${relative(root, path)}`;
    components.push({ ...data, source, document, api });
    await writeOrCheck(resolve(root, `dist/docs/${data.id}.md`), markdown, check);
  }
  components.sort((a, b) => a.id.localeCompare(b.id));
  for (const component of components) for (const id of component.related)
    assert.ok(components.some(item => item.id === id), `unknown related component ${id}: ${component.id}`);
  for (const [entry, names] of Object.entries(entries)) for (const name of names) {
    if (/^[A-Z]/.test(name)) assert.ok(components.some(component => component.title === name && component.entry === entry), `missing contract for export ${name}`);
  }
  await writeOrCheck(resolve(root, "dist/components.json"), JSON.stringify({ schemaVersion: 1, name: pkg.name, version: pkg.version, private: pkg.private, components }, null, 2) + "\n", check);
  const index = `# ${pkg.name} ${pkg.version}\n\nLocal workspace package; private, not published.\n\n- [Agent guide](docs/ui/agent-guide.md): adoption order, source owners and verification.\n` +
    components.map(component => `- [${component.title}](docs/ui/${component.id}.md): ${component.summary} (${component.status}, @areal/ui${component.entry === "wip" ? "/wip" : ""}).`).join("\n") + "\n";
  await writeOrCheck(resolve(root, "dist/llms.txt"), index, check);
  await writeOrCheck(resolve(root, "dist/docs/agent-guide.md"), await readFile(resolve(root, "agent-guide.md"), "utf8"), check);
  if (!check) for (const path of srcFiles.filter(path => path.endsWith(".css"))) {
    const output = resolve(root, "dist", relative(resolve(root, "src"), path));
    await mkdir(dirname(output), { recursive: true }); await copyFile(path, output);
  }
  return components.length;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify({ passed: true, components: await buildDocuments(process.argv.includes("--check")) }));
}
