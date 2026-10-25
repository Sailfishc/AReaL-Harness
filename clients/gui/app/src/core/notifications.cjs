// @ts-check
"use strict";
const { modelRecord } = require("@areal/workbench/core-model-contract");
const { readObservedTasks } = require("./history-contract.cjs");
const { workOverview } = require("./remote-core-decoder.cjs");
/** @typedef {{kind:'completion'|'approval'|'question',projectId:string,threadId?:string,taskId?:string,runId?:string|null,questionId?:string,body:string,silent?:boolean}} NotificationContent */
/** @typedef {NotificationContent & {id:string}} Notice */
/** @typedef {import('@areal/workbench/core-model-contract').CoreTask & {mode?:string,objective:string,runs:Array<import('./history-contract.cjs').ObservedTask['runs'][number] & {objective?:string|null}>}} NotificationTask */
/** @typedef {{taskId:string,objective:string,message:{id:string,status:string,runId:string,expiresAt?:number|null}}} InboxRow */

// 通知来自 Core 活动事件或定时投影的变化；去重提示不替代执行状态。
class CoreNotifications {
  /** @param {(notice:Notice)=>void} deliver */
  constructor(deliver) {
    this.deliver = deliver;
    this.seen = new Set();
  }
  /** @param {import('./project-state.cjs').CoreProject} project @param {string} method @param {import('./history-contract.cjs').HistoryNotification} params @param {{threads?:Record<string,{title?:string}>}} library */
  observe(project, method, params, library) {
    let kind, threadId, eventId;
    if (method === "turn/completed" && params?.turn?.status === "completed") {
      kind = "completion";
      threadId = params.threadId;
      eventId = params.turn.id;
      // Worker/coordinator turns are implementation steps, not user turn alerts.
      if (
        params.turn.goal ||
        (typeof threadId === "string" && project.model.state.threads[threadId]?.goalOwner)
      )
        return;
    } else if (
      method === "areal/interaction/requested" &&
      params?.interaction?.status === "pending"
    ) {
      const item = params.interaction;
      if (item.kind !== "approval" && item.kind !== "question") return;
      kind = item.kind;
      threadId = item.threadId;
      eventId = item.requestId;
    } else return;
    if (typeof threadId !== "string" || typeof eventId !== "string") return;
    const id = JSON.stringify([project.id, kind, threadId, eventId]);
    const title =
      library.threads?.[`${project.id}:${threadId}`]?.title ??
      project.model.state.threads[threadId]?.title ??
      project.summaries.find((t) => t.id === threadId)?.title;
    this.publish({
      id,
      kind,
      projectId: project.id,
      threadId,
      body: String(title || "打开任务查看详情").slice(0, 200),
    });
  }
  /** @param {unknown} notice */
  publish(notice) {
    if (!isNotice(notice)) return;
    if (this.seen.has(notice.id)) return;
    this.seen.add(notice.id);
    if (this.seen.size > 4096) this.seen.delete(this.seen.values().next().value);
    this.deliver(notice);
  }
}

// Core exposes per-Task subscriptions (shared 128-connection quota), not a
// project-wide Task feed. Observe paged public Task/Inbox snapshots centrally;
// never poll from a renderer or infer execution from GUI visibility.
class TaskNotificationMonitor {
  /** @param {import('@areal/runtime-client/core').CoreClient} client @param {string} projectId @param {(notice:Notice)=>void} deliver @param {(error:unknown)=>void} report @param {(tasks:NotificationTask[])=>Promise<void>} [onTasks] */
  constructor(client, projectId, deliver, report, onTasks) {
    this.client = client;
    this.projectId = projectId;
    this.deliver = deliver;
    this.report = report;
    this.onTasks = onTasks;
    /** @type {Set<string>|null} */
    this.previous = null;
    this.stopped = false;
    /** @type {Promise<void>|null} */
    this.pending = null;
    /** @type {NodeJS.Timeout|undefined} */
    this.timer = undefined;
  }
  async start() {
    await this.refresh();
    if (!this.stopped)
      this.timer = setInterval(() => {
        void this.refresh();
      }, 2000);
  }
  stop() {
    this.stopped = true;
    clearInterval(this.timer);
  }
  /** @template T @param {string} method @param {(value:unknown)=>{data:T[],nextCursor?:string|null}} decode */
  async pages(method, decode) {
    /** @type {T[]} */
    const rows = [];
    /** @type {string|null|undefined} */
    let after;
    do {
      const page = await this.client.request(
        method,
        { limit: 100, ...(after ? { after } : {}) },
        { decode },
      );
      rows.push(...page.data);
      if (page.nextCursor && page.nextCursor === after) throw new Error("任务通知分页未前进");
      after = page.nextCursor;
    } while (after && !this.stopped);
    return rows;
  }
  refresh() {
    if (this.stopped) return Promise.resolve();
    if (this.pending) return this.pending;
    this.pending = (async () => {
      const [tasks, inbox] = await Promise.all([
        this.pages("areal/task/list", readTaskPage),
        this.pages("areal/inbox/list", readInboxPage),
      ]);
      if (this.stopped) return;
      await this.onTasks?.(tasks);
      if (this.stopped) return;
      /** @type {Map<string,Notice>} */
      const current = new Map();
      for (const task of tasks)
        for (const run of task.runs ?? []) {
          if (run.status !== "completed") continue;
          const id = JSON.stringify([this.projectId, "task-completion", task.id, run.id]);
          current.set(id, {
            id,
            kind: "completion",
            projectId: this.projectId,
            taskId: task.id,
            runId: run.id,
            body: task.objective.slice(0, 200),
          });
        }
      for (const row of inbox) {
        const message = row.message;
        if (
          message.status !== "pending" ||
          (message.expiresAt != null && message.expiresAt * 1000 <= Date.now())
        )
          continue;
        const id = JSON.stringify([this.projectId, "task-question", row.taskId, message.id]);
        current.set(id, {
          id,
          kind: "question",
          projectId: this.projectId,
          taskId: row.taskId,
          runId: message.runId,
          questionId: message.id,
          body: row.objective.slice(0, 200),
        });
      }
      if (this.client.capabilities?.methods?.includes("areal/work/overview")) {
        const schedules = new Map(
          tasks.filter((task) => task.mode === "scheduled").map((task) => [task.id, task]),
        );
        /** @type {string|null|undefined} */
        let cursor;
        const cursors = new Set();
        do {
          const page = await this.client.request(
            "areal/work/overview",
            { filter: "attention", limit: 100, ...(cursor ? { cursor } : {}) },
            { decode: workOverview },
          );
          if (this.stopped) return;
          for (const row of page.data)
            for (const attention of row.attentionRefs ?? []) {
              const task =
                typeof attention.taskId === "string" ? schedules.get(attention.taskId) : undefined;
              if (
                !task ||
                (attention.kind !== "approval" && attention.kind !== "syncQuestion") ||
                typeof attention.interactionId !== "string" ||
                typeof attention.threadId !== "string" ||
                (attention.runId != null && typeof attention.runId !== "string")
              )
                continue;
              const kind = attention.kind === "approval" ? "approval" : "question";
              const id = JSON.stringify([
                this.projectId,
                kind,
                attention.threadId,
                attention.interactionId,
              ]);
              current.set(id, {
                id,
                kind,
                projectId: this.projectId,
                taskId: task.id,
                runId: attention.runId,
                threadId: attention.threadId,
                body: (
                  task.runs.find((run) => run.id === attention.runId)?.objective ?? task.objective
                ).slice(0, 200),
              });
            }
          cursor = page.nextCursor;
          if (cursor && cursors.has(cursor)) throw new Error("任务关注分页未前进");
          cursors.add(cursor);
        } while (cursor && !this.stopped);
      }
      const previous = this.previous;
      this.previous = new Set(current.keys());
      // The first successful read on every Core connection is a baseline. A
      // disconnected interval is not evidence of a new live notification.
      if (previous) for (const [id, notice] of current) if (!previous.has(id)) this.deliver(notice);
    })()
      .catch((error) => {
        if (!this.stopped) this.report(error);
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }
}

// The selected Electron Main owns native resources. A null window is used only
// by the shared service, whose click handler opens the existing GUI entrypoint.
/** @param {typeof import('electron').Notification} Notification @param {import('electron').BrowserWindow|null} window @param {unknown} notice @param {(target:import('@areal/workbench/desktop-contract').NotificationTarget)=>void} open */
function showCoreNotification(Notification, window, notice, open) {
  if (window?.isDestroyed() || !Notification.isSupported()) return;
  const titles = {
    completion: "任务已完成",
    approval: "任务需要授权",
    question: "任务需要你的回答",
  };
  if (
    !isNotificationContent(notice) ||
    (typeof notice.threadId !== "string" && typeof notice.taskId !== "string")
  )
    return;
  const target =
    typeof notice.taskId === "string"
      ? {
          projectId: notice.projectId,
          taskId: notice.taskId,
          runId: notice.runId ?? undefined,
          questionId: notice.questionId,
        }
      : typeof notice.threadId === "string"
        ? { projectId: notice.projectId, threadId: notice.threadId }
        : undefined;
  if (!target) return;
  try {
    const notification = new Notification({
      title: titles[notice.kind],
      body: notice.body,
      silent: notice.silent,
    });
    notification.on("click", () => {
      if (window?.isDestroyed()) return;
      if (window) {
        if (window.isMinimized()) window.restore();
        window.show();
        window.focus();
      }
      open(target);
    });
    notification.on("failed", (_event, error) => console.warn("系统通知未送达：", error));
    notification.show();
    return notification;
  } catch (error) {
    console.warn("无法显示系统通知：", error instanceof Error ? error.message : String(error));
  }
}

class BackgroundNotifications {
  /** @param {typeof import('electron').Notification} Notification @param {()=>unknown} launch */
  constructor(Notification, launch) {
    this.Notification = Notification;
    this.launch = launch;
    this.entries = new Set();
  }
  get active() {
    return this.entries.size > 0;
  }
  /** @param {unknown} notice @param {(target:import('@areal/workbench/desktop-contract').NotificationTarget)=>void} open */
  show(notice, open) {
    const notification = showCoreNotification(this.Notification, null, notice, open);
    if (!notification) return;
    this.entries.add(notification);
    const release = () => this.entries.delete(notification);
    notification.once("click", release);
    notification.once("close", release);
    notification.once("failed", release);
  }
  close() {
    for (const notification of this.entries) notification.close();
    this.entries.clear();
  }
}
/** @param {unknown} value @returns {value is Notice} */
function isNotice(value) {
  return isNotificationContent(value) && "id" in value && typeof value.id === "string";
}
/** @param {unknown} value @returns {value is NotificationContent} */
function isNotificationContent(value) {
  return (
    modelRecord(value) &&
    typeof value.projectId === "string" &&
    (value.kind === "completion" || value.kind === "approval" || value.kind === "question") &&
    typeof value.body === "string" &&
    ["threadId", "taskId", "questionId"].every(
      (key) => value[key] === undefined || typeof value[key] === "string",
    ) &&
    (value.runId == null || typeof value.runId === "string") &&
    (value.silent === undefined || typeof value.silent === "boolean")
  );
}
/** @param {unknown} value */
function page(value) {
  if (
    !modelRecord(value) ||
    !Array.isArray(value.data) ||
    (value.nextCursor != null && typeof value.nextCursor !== "string")
  )
    throw new Error("任务通知分页结构无效");
  return { data: value.data, nextCursor: value.nextCursor };
}
/** @param {unknown} value @returns {{data:NotificationTask[],nextCursor?:string|null}} */
function readTaskPage(value) {
  const result = page(value);
  const data = readObservedTasks(result.data).map((task) => {
    if (typeof task.objective !== "string") throw new Error("任务通知目标无效");
    const runs = task.runs.map((run) => {
      if (run.objective != null && typeof run.objective !== "string")
        throw new Error("任务通知轮次目标无效");
      return { ...run, objective: run.objective };
    });
    return { ...task, objective: task.objective, runs };
  });
  return { ...result, data };
}
/** @param {unknown} value @returns {{data:InboxRow[],nextCursor?:string|null}} */
function readInboxPage(value) {
  const result = page(value);
  const data = result.data.map((/** @type {unknown} */ row) => {
    if (
      !modelRecord(row) ||
      typeof row.taskId !== "string" ||
      typeof row.objective !== "string" ||
      !modelRecord(row.message) ||
      typeof row.message.id !== "string" ||
      typeof row.message.status !== "string" ||
      typeof row.message.runId !== "string" ||
      (row.message.expiresAt != null && typeof row.message.expiresAt !== "number")
    )
      throw new Error("任务收件箱通知结构无效");
    return {
      ...row,
      taskId: row.taskId,
      objective: row.objective,
      message: {
        ...row.message,
        id: row.message.id,
        status: row.message.status,
        runId: row.message.runId,
        expiresAt: row.message.expiresAt,
      },
    };
  });
  return { ...result, data };
}
module.exports = {
  CoreNotifications,
  TaskNotificationMonitor,
  showCoreNotification,
  BackgroundNotifications,
};
