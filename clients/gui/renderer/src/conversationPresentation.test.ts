import { createIntl } from "react-intl";
import { catalogs } from "./i18n/messages.js";
import type { Translate } from "./i18n/IntlProvider.js";
import { describe, expect, it } from "vite-plus/test";
import type { Data } from "./services.js";
import {
  activityRunLabel,
  activityRuns,
  statusTarget,
  toolPresentation,
} from "./conversationPresentation.js";

const intl = createIntl({ locale: "zh-CN", messages: catalogs["zh-CN"] });
const t: Translate = (id, values) => intl.formatMessage({ id }, values);

describe("statusTarget", () => {
  it("keeps a one-line command as is, with collapsed whitespace", () => {
    expect(statusTarget("pnpm   --dir clients/gui\ttypecheck")).toBe(
      "pnpm --dir clients/gui typecheck",
    );
  });

  it("stops a heredoc at its opening marker", () => {
    const command = "python3 - <<'PY'\nimport pathlib,json\nprint('INDEX')\nPY";
    expect(statusTarget(command)).toBe("python3 - <<'PY'");
    expect(statusTarget('cat <<-"EOF" > out.txt\nbody\nEOF')).toBe('cat <<-"EOF"');
    expect(statusTarget("bash <<EOS\necho hi\nEOS")).toBe("bash <<EOS");
  });

  it("marks a multi-line command that is not a heredoc as truncated", () => {
    expect(statusTarget("\n\ncd app &&\n  pnpm test\n")).toBe("cd app && …");
  });

  it("returns undefined for empty targets", () => {
    expect(statusTarget(undefined)).toBeUndefined();
    expect(statusTarget("  \n ")).toBeUndefined();
  });
});

const tool = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: "dynamicToolCall",
  tool: name,
  status: "completed",
  success: true,
  arguments: {},
  contentItems: [],
  ...extra,
});
const read = (id: string, status = "completed") =>
  tool(id, "fs_read", {
    status,
    success: status === "completed" ? true : undefined,
    arguments: { path: `${id}.ts` },
  });

describe("activityRuns groups", () => {
  const shape = (runs: { key: string | null; items: Data[] }[]) =>
    runs.map((run) => [run.key, run.items.map((item) => item.id)]);
  it("merges every tool between two messages into one group", () => {
    const rows = [
      read("r1"),
      tool("s1", "search_files", { arguments: { pattern: "login" } }),
      tool("c1", "run_command", { arguments: { command: "ls" } }),
      tool("e1", "fs_write", { arguments: { path: "a.ts" } }),
      tool("x1", "lookup_ticket"),
    ];
    expect(shape(activityRuns(rows))).toEqual([["工具", ["r1", "s1", "c1", "e1", "x1"]]]);
  });
  it("splits at reasoning groups and breaker rows", () => {
    const spawn = tool("a1", "agent_spawn");
    const rows = [read("r1"), { id: "g1", type: "reasoningGroup", items: [] }, read("r2"), spawn];
    expect(shape(activityRuns(rows, (item) => item === spawn))).toEqual([
      ["工具", ["r1"]],
      [null, ["g1"]],
      ["工具", ["r2"]],
      [null, ["a1"]],
    ]);
  });
});

describe("activityRunLabel phrases", () => {
  const run = (...items: Data[]) => ({ key: "工具", items });
  it("orders phrases edit, other tools, explore, command", () => {
    expect(
      activityRunLabel(
        run(
          tool("c1", "run_command"),
          read("r1"),
          tool("w1", "browser_v1"),
          tool("e1", "fs_write", { arguments: { path: "a.ts" } }),
        ),
        t,
      ),
    ).toBe("已修改 1 个文件，已使用浏览器，已探索，已运行命令");
  });
  it("counts only distinct completed edited files", () => {
    const edit = (id: string, path: string, extra = {}) =>
      tool(id, "fs_write", { arguments: { path }, ...extra });
    expect(
      activityRunLabel(
        run(
          edit("e1", "a.ts"),
          edit("e2", "a.ts"),
          edit("e3", "b.ts"),
          edit("e4", "c.ts", { status: "inProgress", success: undefined }),
        ),
        t,
      ),
    ).toBe("已修改 2 个文件");
  });
  it("stays past tense while a child is still running", () => {
    expect(activityRunLabel(run(read("a"), read("b", "inProgress")), t)).toBe("已探索");
  });
  it("states failures after the phrases", () => {
    const failed = tool("c2", "run_command", { success: false, execution: { exitCode: 1 } });
    expect(activityRunLabel(run(read("a"), tool("c1", "run_command"), failed), t)).toBe(
      "已探索，已运行命令 · 1 个失败",
    );
  });
});

describe("toolPresentation targets", () => {
  it("never falls back to the internal tool name", () => {
    expect(toolPresentation(tool("l", "fs_list")).detail).toBe("");
    expect(toolPresentation(tool("l", "fs_list")).label).toBe("列出目录");
    expect(toolPresentation(tool("p", "plan_read")).detail).toBe("");
    expect(toolPresentation(tool("x", "lookup_ticket")).detail).toBe("");
  });
  it("names the skill a skill read opened", () => {
    const skill = tool("k", "skill_read", {
      arguments: { skill: { id: "review", revision: "3" }, resource: "SKILL.md" },
    });
    expect(toolPresentation(skill).detail).toBe("review · SKILL.md");
  });
  it("exposes the exit code of a failed command", () => {
    const failed = tool("c", "run_command", { success: false, execution: { exitCode: 2 } });
    expect(toolPresentation(failed)).toMatchObject({ failed: true, exitCode: 2 });
  });
});
