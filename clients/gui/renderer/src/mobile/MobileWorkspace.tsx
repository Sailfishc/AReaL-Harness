import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@areal/ui";
import { TooltipProvider } from "../components/ui/tooltip.js";
import { Messages } from "../Messages.js";
import { projectedTurns } from "../remote/session-projection.js";
import { ProjectFolderIcon } from "../homeChromeIcons.js";
import { useI18n, type MessageId } from "../i18n/IntlProvider.js";
import type { Action, CommandName, Data } from "../services.js";
import type { MobileWorkspace } from "./mobile-workspace.mjs";

function rowStatus(row: Data) {
  if (row.attentionRefs?.length) return "attention";
  if (
    ["running", "inProgress"].includes(row.execution?.state) ||
    ["running", "inProgress"].includes(row.execution?.runStatus)
  )
    return "running";
  if (
    [row.execution?.turnStatus, row.execution?.runStatus, row.execution?.state].includes("failed")
  )
    return "failed";
  return "idle";
}
const taskStatus: Record<string, MessageId> = {
  queued: "mobile.taskQueued",
  running: "mobile.status.running",
  waitingForInput: "mobile.status.attention",
  waitingForAgents: "mobile.taskWaiting",
  paused: "mobile.taskPaused",
  blocked: "mobile.taskBlocked",
  completed: "mobile.taskCompleted",
  failed: "mobile.status.failed",
  cancelled: "mobile.taskCancelled",
};
const dot = {
  attention: "bg-status-attention",
  running: "bg-status-running",
  failed: "bg-status-error",
  idle: "",
};
function Status({ row }: { row: Data }) {
  const { t } = useI18n();
  const status = rowStatus(row);
  return (
    <span className="mobile-status text-foreground-subtle text-fixed-caption">
      {status !== "idle" && (
        <span
          aria-hidden="true"
          className={`mobile-status-dot rounded-[var(--radius-status-dot)] ${dot[status]}`}
        />
      )}
      {t(`mobile.status.${status}`)}
    </span>
  );
}
function Time({ value }: { value: string | number | null | undefined }) {
  const { locale } = useI18n();
  if (value === null || value === undefined) return null;
  const date = new Date(typeof value === "number" ? value * 1000 : value);
  if (!Number.isFinite(date.getTime())) return null;
  return (
    <time className="text-foreground-subtle text-fixed-caption" dateTime={date.toISOString()}>
      {new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(date)}
    </time>
  );
}
export function MobileWorkspaceView({ workspace }: { workspace: MobileWorkspace }) {
  const { t } = useI18n();
  const view = useSyncExternalStore(workspace.subscribe, workspace.snapshot);
  const pull = useRef<number | null>(null);
  const page = view.page;
  const task = view.task;
  const [notice, setNotice] = useState(false);
  const action = useCallback(
    (async (name: CommandName, values: Data): Promise<Data> => {
      if (name !== "history") throw new Error(t("mobile.desktopOnly"));
      if (values.operation === "loadOlder") await workspace.older(values.pageId);
      else if (values.operation === "loadItem") workspace.bodies.retry();
      return {};
    }) as Action,
    [workspace, t],
  );
  const project =
    page.kind === "projects"
      ? null
      : view.projects.find((value) => value.projectId === page.projectId);
  const group = page.kind === "projects" ? null : view.groups[page.projectId];
  const title =
    page.kind === "session"
      ? view.detail?.snapshot.title || t("mobile.untitled")
      : page.kind === "task"
        ? view.task?.title || t("mobile.task")
        : project?.name || t("mobile.projects");
  const snapshot = view.detail?.snapshot;
  return (
    <TooltipProvider>
      <section
        className={`mobile-workspace mobile-stack ${page.kind === "session" ? "mobile-session" : ""}`}
        data-page={page.kind}
        onTouchStart={(event) => {
          if (event.currentTarget.scrollTop === 0 && page.kind !== "session")
            pull.current = event.touches[0].clientY;
        }}
        onTouchEnd={(event) => {
          const start = pull.current;
          pull.current = null;
          if (
            start !== null &&
            event.changedTouches[0].clientY - start >= event.currentTarget.clientHeight / 6
          )
            void workspace.refresh();
        }}
      >
        {page.kind === "projects" && (
          <h2 className="text-fixed-page-title">{t("mobile.projects")}</h2>
        )}
        {page.kind !== "projects" && (
          <div className="mobile-header">
            <Button
              className="mobile-touch"
              variant="ghost"
              data-action="workspace-back"
              onClick={() =>
                workspace.navigate(
                  page.kind === "work"
                    ? { kind: "projects" }
                    : { kind: "work", projectId: page.projectId },
                )
              }
            >
              {t("mobile.back")}
            </Button>
            <h2 className="text-fixed-section-title">{title}</h2>
          </div>
        )}
        {notice && <p role="status">{t("mobile.desktopOnly")}</p>}
        {view.error && <p role="alert">{t("mobile.readFailed")}</p>}
        {view.loading && <p role="status">{t("mobile.loading")}</p>}
        {page.kind !== "session" && (
          <Button
            className="mobile-touch mobile-refresh"
            variant="ghost"
            data-action="refresh"
            disabled={view.loading}
            onClick={() => void workspace.refresh()}
          >
            {t("mobile.refresh")}
          </Button>
        )}
        {page.kind === "projects" && (
          <div className="mobile-stack">
            {!view.projects.length && !view.loading && <p>{t("mobile.noProjects")}</p>}
            {view.projects.map((project) => {
              const rows = view.groups[project.projectId]?.data ?? [];
              const running = rows.filter((row: Data) => rowStatus(row) === "running").length;
              const attention = rows.reduce(
                (count: number, row: Data) => count + (row.attentionRefs?.length ?? 0),
                0,
              );
              const updated = rows
                .map((row: Data) => row.sourceUpdatedAt)
                .filter((value: unknown) => value !== null && value !== undefined)
                .sort()
                .at(-1);
              return (
                <Button
                  key={project.projectId}
                  className="mobile-project-card mobile-touch bg-hover rounded-[var(--radius-card)] text-foreground"
                  variant="ghost"
                  data-project-id={project.projectId}
                  aria-busy={
                    project.connectionState === "online" && !view.groups[project.projectId]
                  }
                  onClick={() => workspace.navigate({ kind: "work", projectId: project.projectId })}
                >
                  <ProjectFolderIcon />
                  <span className="mobile-card-copy">
                    <span className="text-fixed-emphasis">{project.name}</span>
                    <span className="text-fixed-caption text-foreground-subtle">
                      {project.connectionState === "online"
                        ? t("mobile.projectSummary", { running, attention })
                        : t("mobile.projectOffline")}
                    </span>
                    <Time value={updated} />
                  </span>
                  <span aria-hidden="true">›</span>
                </Button>
              );
            })}
          </div>
        )}
        {page.kind === "work" && (
          <>
            <h3 className="text-fixed-label text-foreground-subtle">{t("mobile.recent")}</h3>
            <div className="mobile-stack">
              {!group?.data.length && !view.loading && <p>{t("mobile.noSessions")}</p>}
              {(group?.data ?? []).map((row: Data) => (
                <Button
                  variant="ghost"
                  className="mobile-work-row mobile-touch"
                  key={row.kind === "taskRun" ? `${row.taskId}/${row.runId}` : row.threadId}
                  data-thread-id={row.threadId}
                  data-task-id={row.taskId}
                  onClick={() =>
                    workspace.navigate(
                      row.kind === "taskRun"
                        ? {
                            kind: "task",
                            projectId: page.projectId,
                            taskId: row.taskId,
                            runId: row.runId,
                          }
                        : { kind: "session", projectId: page.projectId, threadId: row.threadId },
                    )
                  }
                >
                  <span className="mobile-card-copy">
                    <span className="text-fixed-control">
                      {row.kind === "taskRun" && `${t("mobile.task")} · `}
                      {row.title || t("mobile.untitled")}
                    </span>
                    <Status row={row} />
                  </span>
                  <Time value={row.sourceUpdatedAt} />
                </Button>
              ))}
            </div>
            {group?.nextCursor && (
              <Button
                variant="ghost"
                className="mobile-touch"
                data-action="more-sessions"
                disabled={view.loading}
                onClick={() => void workspace.more()}
              >
                {t("mobile.olderSessions")}
              </Button>
            )}
          </>
        )}
        {page.kind === "session" && snapshot && (
          <>
            <p className="text-fixed-caption text-foreground-subtle">{project?.name}</p>
            {view.bodyError && (
              <Button
                className="mobile-touch"
                variant="ghost"
                onClick={() => workspace.bodies.retry()}
              >
                {t("mobile.retryBody")}
              </Button>
            )}
            <Messages
              project={{
                id: page.projectId,
                root: "",
                models: snapshot.models ?? [],
                pending: [],
                core: { features: {} },
                state: { connected: true, queues: {}, interactions: {}, threads: {} },
              }}
              thread={{
                id: snapshot.threadId,
                title: snapshot.title,
                turns: projectedTurns(view.turns),
                goals: snapshot.goals,
                desktop: { archived: false },
                displayHistory: workspace.historyView(),
              }}
              action={action}
              dark={matchMedia("(prefers-color-scheme: dark)").matches}
              readOnly
              showTurnNavigation={false}
              reserveResponseSpace={false}
              onLink={() => setNotice(true)}
              onFile={() => setNotice(true)}
              onReview={() => setNotice(true)}
              readTurnReview={async () => {
                throw new Error(t("mobile.desktopOnly"));
              }}
            />
          </>
        )}
        {page.kind === "task" && task && (
          <div className="mobile-stack">
            <p>{t(taskStatus[task.runStatus] ?? "mobile.taskUnavailable")}</p>
            <p>{t("mobile.taskReadOnly")}</p>
            {task.threadId && (
              <Button
                className="mobile-touch"
                onClick={() =>
                  workspace.navigate({
                    kind: "session",
                    projectId: page.projectId,
                    threadId: task.threadId,
                  })
                }
              >
                {t("mobile.openSession")}
              </Button>
            )}
          </div>
        )}
      </section>
    </TooltipProvider>
  );
}
