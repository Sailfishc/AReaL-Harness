import { useI18n } from "./i18n/IntlProvider.js";
import type { ReactNode } from "react";
import { ActivityGroup, ThinkingStatus } from "@areal/ui/experimental";
import "@areal/ui/conversation.css";
import { spawnedAgent } from "./AgentIdentity.js";
import { ActivityIcon } from "./ActivityIcon.js";
import { ReasoningGroup } from "./ReasoningGroup.js";
import {
  activityLabel,
  activityRunLabel,
  activityRuns,
  agentSettlements,
  executionOutcome,
  processItems,
  statusTarget,
  timelineItems,
  toolPresentation,
} from "./conversationPresentation.js";
import type { Data } from "./services.js";

function canAnimateTurn(project: Data, threadId: string, turn: Data) {
  return (
    turn.status === "inProgress" &&
    (project.state?.threads?.[threadId]?.executionConnected ?? !!project.state?.connected) &&
    !turn.modelRetry &&
    !project.state?.interactions?.[threadId]?.data?.some((item: Data) => item.status === "pending")
  );
}

/**
 * CONV-STATUS-01: one live status per turn, at its tail. Running tools and model
 * progress both use the sweeping one-line status; tool rows above stay static.
 * When the host shows the pending decision card (decisionShown), the card is the
 * only place that asks — the tail does not repeat "等待你的确认或回答".
 */
export function TurnActivity({
  turn,
  project,
  threadId,
  decisionShown = false,
}: {
  turn: Data;
  project: Data;
  threadId: string;
  decisionShown?: boolean;
}) {
  const { t } = useI18n();
  if (turn.status !== "inProgress") return null;
  if (
    decisionShown &&
    project.state?.interactions?.[threadId]?.data?.some((item: Data) => item.status === "pending")
  )
    return null;
  const animate = canAnimateTurn(project, threadId, turn);
  const items = processItems(turn.items ?? [], turn.status);
  const currentTool =
    animate &&
    items.findLast((item) => item.type === "dynamicToolCall" && toolPresentation(item).running);
  const detail = currentTool ? statusTarget(toolPresentation(currentTool).detail) : undefined;
  const unconfirmed = items.some(
    (item) => item.type === "dynamicToolCall" && toolPresentation(item).status === "结果待确认",
  );
  const last = items.filter((item) => item.type !== "modelContext").at(-1);
  const summary =
    last?.type === "reasoning"
      ? (last.summary ?? [])
          .filter((part: unknown) => typeof part === "string" && part.trim())
          .at(-1)
      : undefined;
  const label = activityLabel(project, threadId, turn);
  return (
    <div className="turn-activity" data-testid="turn-activity">
      {currentTool ? (
        <ThinkingStatus lines="single" label={detail ? `${label} ${detail}` : label} />
      ) : animate && !unconfirmed ? (
        <ThinkingStatus
          lines="single"
          label={summary || (/^(等待模型|正在思考)/.test(label) ? undefined : label)}
        />
      ) : (
        <p className="execution-status" role="status">
          {unconfirmed && animate ? t("chat.tool.unconfirmed") : label}
        </p>
      )}
    </div>
  );
}

/**
 * Core work items are disclosed in order between visible conversation messages.
 * 连续同一动作的工具合成一段（CONV-ACTIVITY-01）：一项时直接显示该项，多项时折叠为
 * "已运行命令"等动词短语；思考组与子代理创建各自成段。段内顺序与原始历史一致。
 */
export function TurnExecution({
  items,
  live = false,
  turn,
  project,
  threadId,
  renderItem,
}: {
  items: Data[];
  /** 运行中回合的最新执行段：其最后一段在出现后续可见内容前保持进行中。 */
  live?: boolean;
  turn: Data;
  project: Data;
  threadId: string;
  renderItem: (item: Data, disclosure: { animate: boolean }) => ReactNode;
}) {
  const { unfinished } = executionOutcome(items);
  const visibleItems = items.filter(
    (item) => item.type !== "dynamicToolCall" || !toolPresentation(item).failed,
  );
  const tools = visibleItems.filter((item) => item.type === "dynamicToolCall");
  const unconfirmed = tools.some((item) => toolPresentation(item).status === "结果待确认");
  const rows = timelineItems(visibleItems);
  const canAnimate = canAnimateTurn(project, threadId, turn);
  if (!rows.length) return null;
  const status = unconfirmed ? (
    <p role="status">结果待确认</p>
  ) : unfinished && turn.status !== "inProgress" ? (
    <p role="status">仍在运行</p>
  ) : turn.status === "failed" ? (
    <p role="status">回合失败</p>
  ) : null;
  const runs = activityRuns(
    rows,
    (item) => !!spawnedAgent(item) || agentSettlements(item).length > 0,
  );
  const row = (item: Data) => (
    <div key={item.id} className="execution-row">
      {item.type === "reasoningGroup" ? (
        <ReasoningGroup items={item.items} />
      ) : (
        renderItem(item, { animate: canAnimate })
      )}
    </div>
  );
  return (
    <div className="turn-execution" data-testid="turn-execution">
      {runs.map((run, index) => {
        const last = index === runs.length - 1;
        const grouped = run.key !== null && run.items.length > 1;
        const icon = toolPresentation(
          run.items.find((item) => toolPresentation(item).running) ?? run.items[0],
        ).icon;
        return (
          <ActivityGroup
            key={run.items[0].id}
            presentation={grouped ? "collapsible" : "inline"}
            label={
              run.key !== null
                ? activityRunLabel(run, live && last)
                : run.items[0].type === "reasoningGroup"
                  ? "思考过程"
                  : "执行活动"
            }
            icon={grouped ? <ActivityIcon kind={icon} /> : undefined}
            status={last ? status : undefined}
          >
            {run.items.map(row)}
          </ActivityGroup>
        );
      })}
    </div>
  );
}
