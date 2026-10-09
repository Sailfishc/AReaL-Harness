// Compact sections follow ZCode ConversationStatusPanel; only public Core/workspace facts.
import { useEffect, useRef, useState } from "react";
import {
  GitBranch,
  FileDiff,
  RefreshCw,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  Activity,
} from "lucide-react";
import { processItems, toolPresentation } from "./conversationPresentation.js";
import type { Action, Data } from "./services.js";
export function ConversationStatusCard({
  project,
  thread,
  action,
  onPanel,
}: {
  project: Data;
  thread: Data;
  action: Action;
  onPanel: (name: string) => void;
}) {
  const [git, setGit] = useState<Data>({ loading: true });
  const [revision, refresh] = useState(0);
  const request = useRef(action);
  request.current = action;
  const turns = thread.turns ?? [];
  const turn = turns.at(-1);
  const tools = processItems(turn?.items ?? [], turn?.status).filter((i: Data) => i.type === "dynamicToolCall" && !i.processOwnerId);
  // Refresh after execution facts change, never once per streamed token.
  const checkpoint = JSON.stringify([
    turn?.id,
    turn?.status,
    tools.filter((i: Data) => !toolPresentation(i).running && !i.processUnsettled).map((i: Data) => i.id),
  ]);
  useEffect(() => {
    let active = true;
    setGit((previous) => ({ ...previous, loading: true }));
    const run = async () => {
      try {
        const info = await request.current("workspace", {
          projectId: project.id,
          operation: "info",
        });
        let review: Data | undefined;
        if (info.git !== false && info.head)
          review = await request.current("workspace", {
            projectId: project.id,
            operation: "review",
            scope: "unstaged",
          });
        if (active) setGit({ info, review });
      } catch (e) {
        if (active) setGit({ error: (e as Error).message });
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [project.id, checkpoint, revision]);
  const files = git.review?.files ?? [];
  const total = (key: string) => files.reduce((n: number, f: Data) => n + (f[key] ?? 0), 0);
  const known = turns.filter((t: Data) => t.usage);
  const tokens = known.reduce(
    (n: number, t: Data) => n + (t.usage.inputTokens ?? 0) + (t.usage.outputTokens ?? 0),
    0,
  );
  const running = turn?.status === "inProgress";
  return (
    <aside className="conversation-status-rail" aria-label="任务摘要">
      <div className="conversation-status-card">
        <section>
          <div className="status-card-heading">
            <span>Git 工具</span>
            <button
              className="icon-button"
              aria-label="刷新任务摘要"
              disabled={git.loading}
              onClick={() => refresh((n) => n + 1)}
            >
              <RefreshCw size={13} />
            </button>
          </div>
          {git.error ? (
            <p role="status">无法读取 Git 状态：{git.error}</p>
          ) : git.loading && !git.info ? (
            <p className="status-card-muted">读取改动…</p>
          ) : git.info?.git === false ? (
            <p className="status-card-muted">此工作区未使用 Git</p>
          ) : (
            <>
              <button
                className="status-card-link"
                aria-label="未暂存改动"
                disabled={!git.info?.head}
                onClick={() => onPanel("改动")}
              >
                <FileDiff size={16} />
                <span>未暂存改动</span>
                {git.review && (
                  <span className="diff-count">
                    <b>+{total("additions")}</b>
                    <em>−{total("deletions")}</em>
                  </span>
                )}
              </button>
              <div className="status-card-link">
                <GitBranch size={16} />
                <span>{git.info?.branch || "分离的 HEAD"}</span>
              </div>
              {!git.info?.head && <p className="status-card-muted">尚无提交，暂不能查看 Diff。</p>}
              {files.length > 0 && (
                <details className="status-files">
                  <summary>{files.length} 个文件</summary>
                  {files.map((file: Data) => (
                    <button
                      key={file.path}
                      className="status-file"
                      onClick={() => onPanel("改动")}
                      title={file.path}
                    >
                      {file.path}
                      <span>
                        +{file.additions} −{file.deletions}
                      </span>
                    </button>
                  ))}
                </details>
              )}
            </>
          )}
        </section>
        <section>
          <div className="status-card-heading">
            <span>当前执行</span>
            <span>
              {(
                {
                  completed: "已完成",
                  failed: "失败",
                  interrupted: "已停止",
                  inProgress: "执行中",
                } as Data
              )[turn?.status] ?? "等待发送"}
            </span>
          </div>
          <div className="status-card-link">
            {running ? <LoaderCircle size={16} className="animate-spin" /> : <Activity size={16} />}
            <span>
              {tools.length
                ? `${tools.filter((i: Data) => !toolPresentation(i).running && !i.processUnsettled).length} / ${tools.length} 项活动已结束`
                : "暂无工具调用"}
            </span>
          </div>
          {tools.length > 0 && (
            <ul className="status-tool-list">
              {tools.slice(-6).map((item: Data) => {
                const view = toolPresentation(item);
                return (
                  <li key={item.id}>
                    {view.running ? (
                      <LoaderCircle size={14} className="animate-spin" />
                    ) : view.failed ? (
                      <CircleAlert size={14} className="tool-failed" />
                    ) : item.processUnsettled ? (
                      <Activity size={14} />
                    ) : (
                      <CheckCircle2 size={14} />
                    )}
                    <span title={view.detail}>
                      {view.label} {view.detail}
                    </span>
                    <small>{view.status}</small>
                  </li>
                );
              })}
            </ul>
          )}
          {known.length > 0 && (
            <button className="status-card-link status-card-muted" onClick={() => onPanel("用量")}>
              {tokens.toLocaleString()} tokens · {known.length}/{turns.length} 轮已报告
            </button>
          )}
        </section>
      </div>
    </aside>
  );
}
