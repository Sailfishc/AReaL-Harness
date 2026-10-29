import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Messages } from "../src/Messages";
import { ApplicationIntlProvider } from "../src/i18n/IntlProvider";
import { TooltipProvider } from "../src/components/ui/tooltip";
import type { Action } from "../src/services";
import "../src/styles.css";
import "../src/workbench.css";

const contexts = new URLSearchParams(location.search).get("contexts") === "32" ? 32 : 1;
const owner = JSON.stringify(["reading-profile", "reading-thread", false]);
const checkpointKey = "areal-gui:reading-views:v1";
if (!sessionStorage.getItem(checkpointKey))
  sessionStorage.setItem(
    checkpointKey,
    JSON.stringify({
      version: 1,
      views: Array.from({ length: contexts }, (_, index) => ({
        owner:
          index === 0 ? owner : JSON.stringify(["stored-project", `stored-thread-${index}`, false]),
        position:
          index === 0
            ? { kind: "latest" }
            : {
                kind: "reading",
                anchor: {
                  turnId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                  itemId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                  blockIndex: 10,
                  offset: -12.5,
                },
              },
      })),
    }),
  );
document.documentElement.style.setProperty("--ui-font-size", "14px");
const action: Action = async () => {
  throw new Error("Reading fixture cannot submit business commands");
};
const noop = () => {};

function Fixture() {
  const [output, setOutput] = useState(0);
  const thread = {
    id: "reading-thread",
    turns: [
      {
        id: "history-turn",
        status: "completed",
        items: [
          {
            id: "history-message",
            type: "agentMessage",
            phase: "final_answer",
            text: Array.from(
              { length: 48 },
              (_, index) =>
                `History paragraph ${index}: retained evidence and reading context stay visible.`,
            ).join("\n\n"),
          },
        ],
      },
      {
        id: "stream-turn",
        status: "inProgress",
        items: [
          {
            id: "user-message",
            type: "userMessage",
            content: [{ type: "text", text: "Read the retained history while output grows." }],
          },
          {
            id: "stream-message",
            type: "agentMessage",
            phase: "commentary",
            text: `Output update ${output}\n\n` + "New streamed paragraph.\n\n".repeat(output + 1),
          },
        ],
      },
    ],
  };
  return (
    <ApplicationIntlProvider>
      <TooltipProvider>
        <main
          data-testid="reading-fixture"
          data-output={output}
          style={{ height: "100vh", width: 760, display: "flex", flexDirection: "column" }}
        >
          <header style={{ flex: "none", padding: 8 }}>
            <button onClick={() => setOutput((value) => value + 1)}>Append output</button>
            <span> Synthetic reading fixture; {contexts} contexts; no Core or model.</span>
          </header>
          <Messages
            project={{
              id: "reading-profile",
              root: "/fixture",
              state: { connected: true },
              pending: [],
            }}
            thread={thread}
            action={action}
            dark={false}
            onLink={noop}
            onFile={noop}
            onReview={noop}
            readTurnReview={async () => ({})}
            reserveResponseSpace={false}
          />
        </main>
      </TooltipProvider>
    </ApplicationIntlProvider>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
