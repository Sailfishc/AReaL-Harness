import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { TurnExecution } from "./TurnExecution.js";

vi.mock("./i18n/IntlProvider.js", () => ({ useI18n: () => ({ t: (id: string) => id }) }));

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
const render = (live: boolean) =>
  renderToStaticMarkup(
    createElement(TurnExecution, {
      items: [read("a"), read("b")],
      live,
      turn: { id: "turn", status: "inProgress" },
      project,
      threadId: "thread",
      renderItem: (item) => createElement("span", null, item.id),
    }),
  );

describe("TurnExecution stage boundary", () => {
  it("keeps the open segment in progress while the model thinks between calls", () => {
    expect(render(true)).toContain("正在读取文件");
  });
  it("settles the segment once later visible content closed it", () => {
    expect(render(false)).toContain("已读取文件");
  });
});
