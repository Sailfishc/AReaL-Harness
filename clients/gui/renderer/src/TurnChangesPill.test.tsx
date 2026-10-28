import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { Translate } from "./i18n/IntlProvider.js";
import { TurnChangesPill } from "./TurnFileSummary.js";

vi.mock("./i18n/IntlProvider.js", async () => {
  const { createIntl } = await import("react-intl");
  const { catalogs } = await import("./i18n/messages.js");
  const intl = createIntl({ locale: "zh-CN", messages: catalogs["zh-CN"] });
  const t: Translate = (id, values) => intl.formatMessage({ id }, values);
  return { useI18n: () => ({ t }) };
});

const receipt = (id: string, tool: string, path: string) => ({
  id,
  type: "dynamicToolCall",
  tool,
  status: "completed",
  success: true,
  arguments: { path },
  contentItems: [
    {
      type: "inputText",
      text: JSON.stringify({ path: `workspace://repo/${path}`, sha256: "a".repeat(64), size: 1 }),
    },
  ],
});
const render = (turn: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(TurnChangesPill, { turn, onReview: () => {} }));

describe("TurnChangesPill", () => {
  it("counts verified writes of the running turn, not reads", () => {
    const markup = render({
      id: "t",
      status: "inProgress",
      items: [
        receipt("w1", "fs_write", "a.ts"),
        receipt("w2", "fs_apply_patch", "a.ts"),
        receipt("w3", "fs_create", "b.ts"),
        receipt("r1", "fs_read", "c.ts"),
      ],
    });
    expect(markup).toContain("2 个文件已更改");
    expect(markup).toContain('aria-label="查看本轮已更改的 2 个文件"');
  });
  it("hides once the turn ends, when the final file summary takes over", () => {
    expect(
      render({ id: "t", status: "completed", items: [receipt("w1", "fs_write", "a.ts")] }),
    ).toBe("");
  });
  it("hides while nothing has been written", () => {
    expect(
      render({ id: "t", status: "inProgress", items: [receipt("r1", "fs_read", "a.ts")] }),
    ).toBe("");
  });
});
