import { createRoot } from "react-dom/client";
import { App } from "../src/App";
import { ApplicationIntlProvider } from "../src/i18n/IntlProvider";
import { TooltipProvider } from "../src/components/ui/tooltip";
import type { PlatformServices, Snapshot } from "../src/services";
import "../src/styles.css";
import "../src/workbench.css";

const projects = Array.from({ length: 12 }, (_, index) => ({
  id: `project-${index}`,
  root: `/fixture/project-${index}`,
  state: { connected: true, threads: {}, queues: {}, interactions: {} },
  core: { connectionGeneration: 1 },
  summariesLoaded: true,
  summaries: Array.from({ length: 40 }, (_, thread) => ({
    id: `thread-${index}-${thread}`,
    name: `Conversation ${index}-${thread}`,
    createdAt: thread,
    updatedAt: thread,
  })),
  pending: [],
  configurations: {},
  outcomes: {},
  models: [],
  profiles: [],
}));
let snapshot: Snapshot = {
  revision: 1,
  projects,
  connection: { state: "ready" },
  library: {
    projects: {},
    threads: {},
    projectOrder: projects.map((project) => project.id),
    settings: {},
  },
};
const listeners = new Set<(value: Snapshot) => void>();
const calls: string[] = [];
const services: PlatformServices = {
  snapshot: async () => snapshot,
  onState(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  chooseProject: async () => null,
  command: async (name) => {
    calls.push(name);
    if (name === "open" || name === "connect" || name === "library")
      return { ok: true, value: snapshot };
    if (name === "workspace") return { ok: true, value: { git: false } };
    if (name === "trajectory")
      return { ok: true, value: { enabled: false, state: "disabled", queue: {}, records: [] } };
    return { ok: true, value: { data: [] } };
  },
  theme: async () => ({ platform: "darwin", id: "light", dark: false }),
  onTheme: () => () => {},
  preview: async () => ({}),
  presentReady: async () => {},
};
localStorage.setItem("areal-gui:project", "project-0");
localStorage.removeItem("areal-gui:thread:project-0");

Object.assign(window, {
  navigationFixture: {
    calls,
    publish(kind: "rename" | "unread" | "running" | "order" | "snapshot") {
      const library = snapshot.library ?? {};
      snapshot = {
        ...snapshot,
        revision: (snapshot.revision ?? 0) + 1,
        ...(kind === "running"
          ? {
              projects: snapshot.projects.map((project) =>
                project.id !== "project-0"
                  ? project
                  : {
                      ...project,
                      state: {
                        ...project.state,
                        threads: {
                          ...project.state.threads,
                          "thread-0-39": {
                            id: "thread-0-39",
                            turns: [{ id: "running", status: "inProgress", items: [] }],
                          },
                        },
                      },
                    },
              ),
            }
          : {}),
        library: {
          ...library,
          ...(kind === "rename" || kind === "unread"
            ? {
                threads: {
                  ...library.threads,
                  "project-0:thread-0-39": {
                    ...library.threads?.["project-0:thread-0-39"],
                    ...(kind === "rename" ? { title: "Renamed conversation" } : { unread: true }),
                  },
                },
              }
            : {}),
          ...(kind === "order" ? { projectOrder: [...library.projectOrder].reverse() } : {}),
        },
      };
      for (const listener of listeners) listener(snapshot);
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <ApplicationIntlProvider>
    <TooltipProvider>
      <App services={services} />
    </TooltipProvider>
  </ApplicationIntlProvider>,
);
