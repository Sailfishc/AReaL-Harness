// 设计文档里的生成区块：从机器可读来源渲染 Markdown，--write 写入，默认只检查是否过时。
// 区块用 <!-- BEGIN GENERATED: id --> / <!-- END GENERATED: id --> 包住；design-rules.mjs 跳过区块内文字。
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const gui = fileURLToPath(new URL("../", import.meta.url));
const cell = (value) => String(value).replaceAll("|", "\\|");

export const blocks = [
  {
    id: "activity-runs",
    document: "renderer/src/Messages.md",
    async render() {
      const { cases } = JSON.parse(
        await readFile(resolve(gui, "renderer/src/activity-runs.cases.json"), "utf8"),
      );
      const rows = cases.map((entry) => {
        const tools = entry.tools
          .map(([, name, args = {}]) => {
            const target = args.path ?? args.pattern ?? args.command;
            return target ? `${name}(${target})` : name;
          })
          .join("、");
        const labels = (locale) => cell(entry.runs.map((run) => run.label[locale]).join(" / "));
        return `| ${cell(entry.name)} | ${cell(tools)} | ${labels("zh-CN")} | ${labels("en")} |`;
      });
      return [
        "| 情形 | 工具序列 | 中文标题 | English |",
        "| --- | --- | --- | --- |",
        ...rows,
      ].join("\n");
    },
  },
];

export function replaceBlock(document, id, body) {
  const begin = `<!-- BEGIN GENERATED: ${id} -->`;
  const end = `<!-- END GENERATED: ${id} -->`;
  const start = document.indexOf(begin);
  const stop = document.indexOf(end);
  assert.ok(start >= 0 && stop > start, `missing generated block ${id}`);
  return `${document.slice(0, start + begin.length)}\n${body}\n${document.slice(stop)}`;
}

export async function verifyGenerated({ write = false } = {}) {
  const stale = [];
  for (const block of blocks) {
    const path = resolve(gui, block.document);
    const current = await readFile(path, "utf8");
    const next = replaceBlock(current, block.id, await block.render());
    if (next === current) continue;
    if (write) await writeFile(path, next);
    else stale.push(`${block.document}#${block.id}`);
  }
  assert.deepEqual(
    stale,
    [],
    `生成区块已过时，请运行 node scripts/design-generated.mjs --write：\n${stale.join("\n")}`,
  );
  return { blocks: blocks.length, written: write };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(JSON.stringify(await verifyGenerated({ write: process.argv.includes("--write") })));
