import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// 弹出层锚点稳定性的静态检查：
// 1. dead-state-selector：Radix 的开合/选中状态值（[data-state="open"] 等）必须有源码按字面写入。
//    Base UI 不输出它们，打开态用 [data-popup-open]，开合用 [data-open]/[data-closed]。
// 2. hover-layout：“悬停/聚焦/打开某元素时，改另一元素的布局”会移动其中的弹出层锚点；
//    显隐改用 HoverActions（只改 opacity）。
const root = fileURLToPath(new URL("../", import.meta.url));
const cssRoots = ["renderer/src", "renderer/remote-web", "packages/ui/src", "app/src"];
const sourcePattern = /\.(?:[cm]?js|tsx?|html)$/;
const layoutProperties = new Set([
  "width",
  "min-width",
  "max-width",
  "display",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "inset",
  "inset-inline",
  "inset-inline-start",
  "inset-inline-end",
  "flex-basis",
]);
const radixStates = new Set([
  "open",
  "closed",
  "delayed-open",
  "instant-open",
  "active",
  "inactive",
  "checked",
  "unchecked",
  "indeterminate",
  "on",
  "off",
]);
const statePattern = /:hover|:focus-within|:focus-visible|\[data-popup-open\]|\[aria-expanded/;

async function files(path, pattern) {
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  return (
    await Promise.all(
      entries.map((entry) => {
        const child = resolve(path, entry.name);
        if (entry.isDirectory())
          return ["node_modules", "dist", "generated"].includes(entry.name)
            ? []
            : files(child, pattern);
        return pattern.test(entry.name) ? [child] : [];
      }),
    )
  ).flat();
}

// 足够本仓库使用的 CSS 规则拆分：去注释，按花括号递归进入 @media/@supports 等块。
export function cssRules(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
  const rules = [];
  const walk = (start, end) => {
    let cursor = start;
    while (cursor < end) {
      const open = text.indexOf("{", cursor);
      if (open === -1 || open >= end) return;
      let depth = 1;
      let close = open + 1;
      for (; close < end && depth; close++)
        if (text[close] === "{") depth++;
        else if (text[close] === "}") depth--;
      const prelude = text.slice(cursor, open).split(/[;}]/).pop().trim();
      const body = text.slice(open + 1, close - 1);
      if (prelude.startsWith("@")) walk(open + 1, close - 1);
      else if (!body.includes("{"))
        rules.push({
          selector: prelude.replace(/\s+/g, " "),
          line: text.slice(0, open).split("\n").length,
          declarations: body
            .split(";")
            .map((item) => item.split(":")[0].trim().toLowerCase())
            .filter(Boolean),
        });
      cursor = close;
    }
  };
  walk(0, text.length);
  return rules;
}

function selectors(selector) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const char of selector) {
    if ("([".includes(char)) depth++;
    if (")]".includes(char)) depth--;
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else current += char;
  }
  return [...parts, current.trim()].filter(Boolean);
}

// 状态出现在祖先/兄弟复合选择器上，或以 :has() 落在后代上，被改布局的元素里就可能有弹出层锚点。
export function changesOtherElement(selector) {
  let depth = 0;
  let lastCombinator = -1;
  for (let index = 0; index < selector.length; index++) {
    const char = selector[index];
    if ("([".includes(char)) depth++;
    else if (")]".includes(char)) depth--;
    else if (depth === 0 && /[\s>+~]/.test(char)) lastCombinator = index;
  }
  const subject = selector.slice(lastCombinator + 1);
  return (
    (lastCombinator > 0 && statePattern.test(selector.slice(0, lastCombinator))) ||
    /:has\([^)]*(?:\[data-popup-open\]|\[aria-expanded|:hover|:focus)/.test(subject)
  );
}

export function findHoverLayout(file, css) {
  return cssRules(css).flatMap((rule) => {
    const properties = rule.declarations.filter((name) => layoutProperties.has(name));
    if (!properties.length) return [];
    return selectors(rule.selector)
      .filter(changesOtherElement)
      .map((selector) => ({
        file,
        rule: "hover-layout",
        line: rule.line,
        snippet: `${selector} { ${properties.join(", ")} }`,
      }));
  });
}

export function findDeadStateSelectors(file, css, writtenValues) {
  return cssRules(css).flatMap((rule) =>
    selectors(rule.selector)
      .filter((selector) =>
        [...selector.matchAll(/\[data-state=["']?([^"'\]]*)["']?\]/g)].some(
          ([, value]) => radixStates.has(value) && !writtenValues.has(value),
        ),
      )
      .map((selector) => ({
        file,
        rule: "dead-state-selector",
        line: rule.line,
        snippet: selector,
      })),
  );
}

// 源码按字面写入的 data-state 值（JSX 属性或对象键）；动态值无法静态确认，不算数。
export function writtenStateValues(source) {
  return new Set(
    [...source.matchAll(/["']?data-state["']?\s*[=:]\s*\{?\s*["']([^"']+)["']/g)].map(
      ([, value]) => value,
    ),
  );
}

export async function runPopupAnchorLint() {
  const sources = (
    await Promise.all(cssRoots.map((path) => files(resolve(root, path), sourcePattern)))
  ).flat();
  const written = new Set();
  for (const path of sources)
    for (const value of writtenStateValues(await readFile(path, "utf8"))) written.add(value);
  const findings = [];
  for (const path of (
    await Promise.all(cssRoots.map((dir) => files(resolve(root, dir), /\.css$/)))
  ).flat()) {
    const css = await readFile(path, "utf8");
    const file = relative(root, path);
    findings.push(...findDeadStateSelectors(file, css, written), ...findHoverLayout(file, css));
  }
  const occurrences = new Map();
  return findings.map(({ line, ...finding }) => {
    const identity = `${finding.file}\0${finding.rule}\0${finding.snippet}`;
    const occurrence = (occurrences.get(identity) ?? 0) + 1;
    occurrences.set(identity, occurrence);
    return {
      ...finding,
      line,
      fingerprint: createHash("sha256").update(identity).update(String(occurrence)).digest("hex"),
    };
  });
}

export async function verifyPopupAnchorLint() {
  const findings = await runPopupAnchorLint();
  const baseline = JSON.parse(
    await readFile(resolve(root, "design-system/popup-anchor-baseline.json"), "utf8"),
  );
  assert.ok(
    baseline.every((finding) => finding.reason?.trim() && finding.exitCondition?.trim()),
    "legacy popup anchor findings need a reason and exit condition",
  );
  assert.equal(
    new Set(baseline.map((finding) => finding.fingerprint)).size,
    baseline.length,
    "duplicate popup anchor baseline identity",
  );
  const admitted = new Set(baseline.map((finding) => finding.fingerprint));
  const failures = findings.filter((finding) => !admitted.has(finding.fingerprint));
  assert.deepEqual(
    failures,
    [],
    "new popup anchor findings: hide hover actions with HoverActions (opacity only) and match Base UI open state with [data-popup-open]",
  );
  const current = new Set(findings.map((finding) => finding.fingerprint));
  const stale = baseline.filter((finding) => !current.has(finding.fingerprint));
  assert.deepEqual(stale, [], "resolved popup anchor findings must leave the baseline");
  return { findings: findings.length, baseline: baseline.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--list"))
    console.log(JSON.stringify(await runPopupAnchorLint(), null, 2));
  else console.log(JSON.stringify(await verifyPopupAnchorLint()));
}
