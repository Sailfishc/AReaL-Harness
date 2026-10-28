import { Profiler, useMemo, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { CoreTaskModel } from "@areal/workbench/core-model";
import { ApplicationIntlProvider } from "../src/i18n/IntlProvider";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { Messages } from "../src/Messages";
import type { Action, Data } from "../src/services";
import "../src/styles.css";
import "../src/workbench.css";

const model = new CoreTaskModel();
const threadId = "message-cache-thread";
const calls: { name: string; operation?: string }[] = [];
const empty = () => {};
const readReview = async () => ({});
const action = (async (name: string, params: Data) => {
  calls.push({ name, operation: params.operation });
  if (name === "history" && params.operation === "acquire")
    return { supported: true, complete: true };
  if (name === "history" && params.operation === "release") return { released: true };
  if (name === "feedback" && params.operation === "status")
    return { enabled: false, connected: false, opted_in: false };
  throw Error("Message fixture does not execute work");
}) as Action;
function turn(index: number, status = "completed") {
  return {
    id: `turn-${index}`,
    status,
    durationMs: 2000,
    items: [
      {
        id: `user-${index}`,
        type: "userMessage",
        content: [{ type: "text", text: `Inspect item ${index}` }],
      },
      {
        id: `commentary-${index}`,
        type: "agentMessage",
        phase: "commentary",
        text: `I will inspect the files for item ${index}.`,
      },
      {
        id: `tool-${index}`,
        type: "dynamicToolCall",
        tool: "fs_read",
        arguments: { path: `file-${index}.txt` },
        status: "completed",
        success: true,
        contentItems: [
          {
            type: "inputText",
            text: JSON.stringify({ path: `file-${index}.txt`, text: "Verified result" }),
          },
        ],
      },
      {
        id: `tool-extra-${index}`,
        type: "dynamicToolCall",
        tool: "fs_read",
        arguments: { path: `extra-${index}.txt` },
        status: "completed",
        success: true,
        contentItems: [{ type: "inputText", text: "Second verified result" }],
      },
      {
        id: `command-${index}`,
        type: "dynamicToolCall",
        tool: "run_command",
        arguments: { command: "printf verified" },
        status: "completed",
        success: true,
        execution: { exitCode: 0 },
        contentItems: [{ type: "inputText", text: "verified" }],
      },
      {
        id: `answer-${index}`,
        type: "agentMessage",
        phase: "final_answer",
        text: `Historical result ${index}.\n\n${"Preserve this reading position. ".repeat(12)}`,
      },
    ],
  };
}
model.replace({
  id: threadId,
  turns: Array.from({ length: 101 }, (_, index) =>
    turn(index, index === 100 ? "inProgress" : "completed"),
  ),
  displayHistory: { supported: true, complete: true, viewGeneration: "fixture-view" },
});
model.connection(true);

function Fixture() {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  const [local, setLocal] = useState(0);
  const [projectId, setProjectId] = useState("message-project");
  const project = useMemo(
    () => ({
      id: projectId,
      root: "/isolated/messages",
      configurations: {},
      core: { instanceId: projectId, connectionGeneration: 1 },
      state,
    }),
    [projectId, state],
  );
  Object.assign(window, {
    messageFixture: {
      calls,
      delta(index: number) {
        model.event("item/agentMessage/delta", {
          threadId,
          turnId: "turn-100",
          itemId: "answer-100",
          delta: ` output-${index}`,
        });
      },
      complete() {
        model.event("turn/completed", {
          threadId,
          turn: { id: "turn-100", status: "completed", durationMs: 4000, items: [] },
        });
      },
      gap(show: boolean) {
        model.replace({
          ...model.state.threads[threadId],
          displayHistory: {
            supported: true,
            complete: true,
            viewGeneration: "fixture-view",
            gaps: show ? [{ id: "evicted-page", beforeItemId: "answer-50" }] : [],
          },
        });
      },
      replaceOwner() {
        setProjectId("replacement-project");
        const replacement = turn(0);
        replacement.items[replacement.items.length - 1].text = "REPLACEMENT_OWNER_RESULT";
        model.replace({
          id: threadId,
          turns: [replacement],
          displayHistory: { supported: true, complete: true, viewGeneration: "replacement-view" },
        });
      },
    },
  });
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <button type="button" onClick={() => setLocal((value) => value + 1)}>
        Local chrome update {local}
      </button>
      <output data-testid="fixture-local">{local}</output>
      <Profiler
        id="Messages"
        onRender={(_id, _phase, actualDuration) => {
          const metrics = (
            window as unknown as {
              messageRenderMetrics: { commits: number; actualDurationMs: number };
            }
          ).messageRenderMetrics;
          metrics.commits++;
          metrics.actualDurationMs += actualDuration;
        }}
      >
        <Messages
          project={project}
          thread={state.threads[threadId]}
          action={action}
          dark={false}
          readOnly
          onLink={empty}
          onFile={empty}
          onReview={empty}
          readTurnReview={readReview}
        />
      </Profiler>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <ApplicationIntlProvider>
    <TooltipProvider>
      <Fixture />
    </TooltipProvider>
  </ApplicationIntlProvider>,
);
