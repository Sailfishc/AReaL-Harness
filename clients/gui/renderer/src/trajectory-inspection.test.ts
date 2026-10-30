import { expect, test, vi } from "vite-plus/test";
import {
  activityDuration,
  loadTraceTree,
  traceCoverage,
  traceDuration,
} from "./trajectory-inspection.js";
import type { Action, Data } from "./services.js";

const response = (turns: Data[], extra: Data = {}) => ({
  threadId: "root",
  title: "task",
  sources: [],
  legacySources: [],
  executions: { data: [], nextOffset: null },
  activeTurn: null,
  readAtMs: 1000,
  page: {
    data: turns.flatMap((turn) =>
      turn.items.map((item: Data) => ({
        turn: { ...turn, items: [] },
        item,
        sourceTurnId: turn.id,
        sourceItemId: item.id,
      })),
    ),
    complete: true,
    nextCursor: null,
  },
  ...extra,
});
const saved = {
  id: "old",
  status: "completed",
  items: [{ id: "old-item", type: "agentMessage", text: "archived evidence" }],
};

test("pagination reaches older evidence and a terminal refresh replaces active items", async () => {
  let settled = false;
  const action = vi.fn(async (_: string, request: Data) =>
    request.cursor === "older"
      ? response([saved])
      : response(
          [
            {
              id: "latest",
              status: settled ? "completed" : "inProgress",
              items: [{ id: "answer", type: "agentMessage", text: settled ? "final" : "partial" }],
            },
          ],
          {
            page: {
              ...response([
                {
                  id: "latest",
                  status: settled ? "completed" : "inProgress",
                  items: [
                    { id: "answer", type: "agentMessage", text: settled ? "final" : "partial" },
                  ],
                },
              ]).page,
              complete: false,
              nextCursor: "older",
            },
          },
        ),
  );
  const tree = await loadTraceTree(
    action as Action,
    "project",
    "root",
    new AbortController().signal,
  );
  expect(tree.turns.flatMap((t) => t.items).some((i) => i.text === "archived evidence")).toBe(true);
  settled = true;
  const final = await loadTraceTree(
    action as Action,
    "project",
    "root",
    new AbortController().signal,
    tree,
  );
  expect(final.turns.find((t) => t.id === "latest")?.items.map((i: Data) => i.text)).toEqual([
    "final",
  ]);
});

test("missing child coverage is retained instead of reporting a complete search", async () => {
  const action = vi.fn(async (_: string, request: Data) => {
    if (request.executionId) throw new Error("worker unavailable");
    return response([saved], {
      executions: { data: [{ executionId: "worker", title: "isolated task" }], nextOffset: null },
    });
  });
  const tree = await loadTraceTree(
    action as Action,
    "project",
    "root",
    new AbortController().signal,
  );
  expect(traceCoverage(tree)).toEqual(["isolated task: worker unavailable"]);
  const incomplete = vi.fn(async () =>
    response([saved], { page: { data: [], complete: false, nextCursor: null } }),
  );
  await expect(
    loadTraceTree(incomplete as Action, "project", "root", new AbortController().signal),
  ).rejects.toThrow("Incomplete history coverage");
});

test("interruption does not keep counting, and overlapping child work is never summed", () => {
  expect(
    traceDuration({ status: "interrupted", trace: { startedAtMs: 1 } }, 1_000_000),
  ).toBeUndefined();
  expect(
    activityDuration({ status: "running", startedAtMs: 1 }, { status: "interrupted" }, 1_000_000),
  ).toBeUndefined();
  expect(
    traceDuration(
      {
        status: "completed",
        durationMs: 40_000,
        trace: { activities: [{ durationMs: 30_000 }, { durationMs: 30_000 }] },
      },
      1_000_000,
    ),
  ).toBe(40_000);
  expect(
    activityDuration({ status: "running", startedAtMs: 1000 }, { status: "inProgress" }, 3000),
  ).toBe(2000);
});
