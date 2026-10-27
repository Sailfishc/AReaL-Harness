import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertPopupCoverage,
  findPopupTriggers,
  verifyPopupCoverage,
  changesOtherElement,
  findDeadStateSelectors,
  findHoverLayout,
  writtenStateValues,
} from "./popup-anchor-lint.mjs";

// 2026-10-27 侧栏项目行“更多”菜单漂移时的写法。
const driftingProjectRow = `
.project-row:has([data-state="open"]) { background: var(--color-hover); }
.project-actions { width: 0; overflow: hidden; opacity: 0; }
.project-row:hover .project-actions,
.project-actions:has([data-state="open"]) { width: auto; opacity: 1; }
`;

test("flags the drifting project row: hover changes the anchor width", () => {
  assert.deepEqual(
    findHoverLayout("a.css", driftingProjectRow).map((finding) => finding.snippet),
    [".project-row:hover .project-actions { width }"],
  );
});

test("flags Radix open-state selectors that Base UI never writes", () => {
  assert.deepEqual(
    findDeadStateSelectors("a.css", driftingProjectRow, new Set()).map((f) => f.snippet),
    ['.project-row:has([data-state="open"])', '.project-actions:has([data-state="open"])'],
  );
});

test("accepts the HoverActions pattern: opacity only, title padding, Base UI open state", () => {
  const css = `
.project-actions { position: absolute; right: 4px; }
.project-row:is(:hover, :has([data-popup-open])) > .project-label { padding-right: 52px; }
:is(:hover, :has([data-popup-open])) > .areal-hover-actions { opacity: 1; pointer-events: auto; }
@media (hover: none) { .areal-hover-actions { opacity: 1; } }
`;
  assert.deepEqual(findHoverLayout("a.css", css), []);
  assert.deepEqual(findDeadStateSelectors("a.css", css, new Set()), []);
});

test("flags layout changes keyed on an open descendant", () => {
  assert.ok(changesOtherElement(".row:has([data-popup-open])"));
  assert.ok(!changesOtherElement(".button:hover"));
  assert.ok(!changesOtherElement(".row .button"));
});

test("literal data-state writes admit their selector, dynamic ones do not", () => {
  const written = writtenStateValues(
    `<span data-state="open" /><span data-state={state} />{ "data-state": "checked" }`,
  );
  assert.deepEqual([...written].sort(), ["checked", "open"]);
  const css = `.a[data-state="open"] {} .b[data-state="closed"] {} .c[data-state="attention"] {}`;
  assert.deepEqual(
    findDeadStateSelectors("a.css", css, written).map((f) => f.snippet),
    ['.b[data-state="closed"]'],
  );
});

test("rules inside at-rules and comments are parsed", () => {
  const css = `/* .x:hover .y { width: 0 } */
@media (min-width: 1px) { .x:hover .y { display: none; } }`;
  assert.deepEqual(
    findHoverLayout("a.css", css).map((f) => [f.line, f.snippet]),
    [[2, ".x:hover .y { display }"]],
  );
});

test("AST coverage finds aliased and namespaced triggers, ignoring comments and unrelated menus", () => {
  const source = `
    import { HoverActions as Actions, DropdownMenuTrigger as Trigger } from "@areal/ui/experimental";
    import * as UI from "@areal/ui/experimental";
    // <Actions><Trigger /></Actions>
    const text = "<Actions><Trigger /></Actions>";
    const standalone = <Trigger />;
    const row = <Actions><div><Trigger /></div><UI.PopoverTrigger /></Actions>;
    const other = <UI.HoverActions><UI.DropdownMenuTrigger /></UI.HoverActions>;
  `;
  const found = findPopupTriggers("new-row.tsx", source);
  assert.deepEqual(
    found.map(({ triggerName, triggerIndex }) => [triggerName, triggerIndex]),
    [
      ["DropdownMenuTrigger", 0],
      ["PopoverTrigger", 0],
      ["DropdownMenuTrigger", 1],
    ],
  );
  const entries = found.map((item, index) => ({ ...item, id: `popup-${index}` }));
  assertPopupCoverage(found, entries);
  assert.throws(
    () => assertPopupCoverage(found, entries.slice(1)),
    /missing: new-row.tsx:.*DropdownMenuTrigger/,
  );
  assert.throws(
    () =>
      assertPopupCoverage(
        found,
        entries.map((item) => ({ ...item, file: "wrong.tsx" })),
      ),
    /missing: new-row.tsx/,
  );
});

test("all production HoverActions popup triggers are registered", async () => {
  assert.deepEqual(await verifyPopupCoverage(), { triggers: 2, entries: 2 });
});
