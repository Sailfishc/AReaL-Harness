import type { Translate } from "./i18n/IntlProvider.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { TurnExecution } from "./TurnExecution.js";
import type { Data } from "./services.js";

vi.mock("./i18n/IntlProvider.js", async () => {
  const { createIntl } = await import("react-intl");
  const { catalogs } = await import("./i18n/messages.js");
  const intl = createIntl({ locale: "zh-CN", messages: catalogs["zh-CN"] });
  const t: Translate = (id, values) => intl.formatMessage({ id }, values);
  return { useI18n: () => ({ t }) };
});

const project = { state: { connected: true, threads: { thread: { executionConnected: true } } } };
const read = (id: string) => ({
  id,
  type: "dynamicToolCall",
  tool: "fs_read",
  status: "completed",
  success: true,
  arguments: { path: `${id}.ts` },
  contentItems: [],
});
const command = (id: string) => ({
  ...read(id),
  tool: "run_command",
  arguments: { command: "pnpm test" },
});
const render = (items: Data[]) =>
  renderToStaticMarkup(
    createElement(TurnExecution, {
      items,
      turn: { id: "turn", status: "inProgress" },
      project,
      threadId: "thread",
      renderItem: (item) => createElement("span", null, item.id),
    }),
  );

describe("TurnExecution groups", () => {
  it("keeps the title in past tense while the model thinks between calls", () => {
    expect(render([read("a"), read("b")])).toContain("<span>已探索</span>");
  });
  it("puts reads and commands between two messages into one group", () => {
    const markup = render([command("c"), read("a")]);
    expect(markup).toContain("<span>已探索，已运行命令</span>");
    expect(markup).toContain('data-activity-icon="search"');
    expect(markup.match(/areal-activity-group/g)).toHaveLength(1);
  });
});

describe("TurnExecution failures", () => {
  it("keeps a failed step in place instead of hiding it", () => {
    const failed = {
      id: "f",
      type: "dynamicToolCall",
      tool: "run_command",
      status: "completed",
      success: false,
      execution: { exitCode: 1 },
      arguments: { command: "pnpm test" },
      contentItems: [],
    };
    const markup = renderToStaticMarkup(
      createElement(TurnExecution, {
        items: [failed],
        turn: { id: "turn", status: "completed" },
        project,
        threadId: "thread",
        renderItem: (item) => createElement("span", null, `row:${item.id}`),
      }),
    );
    expect(markup).toContain("row:f");
  });
});
