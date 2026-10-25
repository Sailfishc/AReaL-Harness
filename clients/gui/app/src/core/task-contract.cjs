// @ts-check
"use strict";
const { isCoreTask, modelRecord } = require("@areal/workbench/core-model-contract");

// 仅解析桌面实际消费的 tasks.rs 字段，其余 Core 扩展保持未知。
/** @typedef {Record<string,unknown> & {kind:string,at?:number,anchorAt?:number,intervalSeconds?:number|null,timeZone?:string,frequency?:string,localTime?:string}} ScheduleRule */
/** @typedef {{version:number,rule:ScheduleRule,misfire:{kind:string,maxLatenessSeconds?:number},overlap:string,[key:string]:unknown}} Schedule */
/** @typedef {Record<string,unknown> & {at:number,intervalSeconds?:number|null,timeZone?:string}} LegacySchedule */
/** @typedef {Record<string,unknown> & {threadId?:string,turnId?:string,status:string,settled:boolean,execution?:{kind:'thread',threadId:string,turnId:string}|{kind:'workgroup',workgroupId:string,automatic:boolean}}} TaskWorker */
/** @typedef {Record<string,unknown> & {id:string,status:string,threadId?:string|null,goalId?:string|null,reason?:string|null,workers?:TaskWorker[]}} TaskRun */
/** @typedef {import('@areal/workbench/core-model-contract').CoreTask & {mode?:string,objective?:string,owner?:string,interactionMode?:string,threadId?:string|null,sourceThreadId?:string|null,cancelled?:boolean,paused?:boolean,deletedAt?:number|null,nextRunAt?:number|null,schedule?:LegacySchedule|null,scheduleV2?:Schedule|null,runs?:TaskRun[]}} Task */
/** @typedef {{taskId:string,message:{id:string,runId:string,[key:string]:unknown},[key:string]:unknown}} InboxEntry */
/** @param {unknown} value @returns {value is number} */
const integer = (value) => typeof value === "number" && Number.isSafeInteger(value);
/** @param {unknown} value @returns {value is ScheduleRule} */
function scheduleRule(value) {
  return (
    modelRecord(value) &&
    typeof value.kind === "string" &&
    ["at", "anchorAt"].every((key) => value[key] === undefined || integer(value[key])) &&
    (value.intervalSeconds == null || integer(value.intervalSeconds)) &&
    ["timeZone", "frequency", "localTime"].every(
      (key) => value[key] === undefined || typeof value[key] === "string",
    )
  );
}
/** @param {unknown} value @returns {value is Schedule} */
function schedule(value) {
  return (
    modelRecord(value) &&
    integer(value.version) &&
    scheduleRule(value.rule) &&
    modelRecord(value.misfire) &&
    typeof value.misfire.kind === "string" &&
    (value.misfire.maxLatenessSeconds === undefined || integer(value.misfire.maxLatenessSeconds)) &&
    typeof value.overlap === "string"
  );
}
/** @param {unknown} value @returns {value is LegacySchedule} */
function legacySchedule(value) {
  return (
    modelRecord(value) &&
    integer(value.at) &&
    (value.intervalSeconds == null || integer(value.intervalSeconds)) &&
    (value.timeZone === undefined || typeof value.timeZone === "string")
  );
}
/** @param {unknown} value @returns {value is TaskWorker} */
function taskWorker(value) {
  if (
    !modelRecord(value) ||
    typeof value.status !== "string" ||
    typeof value.settled !== "boolean" ||
    !["threadId", "turnId"].every(
      (key) => value[key] === undefined || typeof value[key] === "string",
    )
  )
    return false;
  const execution = value.execution;
  return (
    execution === undefined ||
    (modelRecord(execution) &&
      ((execution.kind === "thread" &&
        typeof execution.threadId === "string" &&
        typeof execution.turnId === "string") ||
        (execution.kind === "workgroup" &&
          typeof execution.workgroupId === "string" &&
          typeof execution.automatic === "boolean")))
  );
}
/** @param {unknown} value @returns {value is TaskRun} */
function taskRun(value) {
  return (
    modelRecord(value) &&
    typeof value.id === "string" &&
    typeof value.status === "string" &&
    ["threadId", "goalId", "reason"].every(
      (key) => value[key] == null || typeof value[key] === "string",
    ) &&
    (value.workers === undefined ||
      (Array.isArray(value.workers) && value.workers.every(taskWorker)))
  );
}
/** @param {unknown} value @returns {value is Task} */
function task(value) {
  return (
    isCoreTask(value) &&
    ["mode", "objective", "owner", "interactionMode"].every(
      (key) => value[key] === undefined || typeof value[key] === "string",
    ) &&
    ["threadId", "sourceThreadId"].every(
      (key) => value[key] == null || typeof value[key] === "string",
    ) &&
    ["cancelled", "paused"].every(
      (key) => value[key] === undefined || typeof value[key] === "boolean",
    ) &&
    ["deletedAt", "nextRunAt"].every((key) => value[key] == null || integer(value[key])) &&
    (value.schedule == null || legacySchedule(value.schedule)) &&
    (value.scheduleV2 == null || schedule(value.scheduleV2)) &&
    (value.runs === undefined || (Array.isArray(value.runs) && value.runs.every(taskRun)))
  );
}
/** @param {unknown} value @returns {Task} */
function readTask(value) {
  if (!task(value)) throw new Error("Core 任务结构无效");
  return value;
}
/** @param {unknown} value @returns {Task} */
function readTaskAdmission(value) {
  if (!task(value))
    throw Object.assign(new Error("Core 任务受理结果不完整，请查询原请求"), {
      code: "ADMISSION_RESULT_INVALID",
      submissionUnknown: true,
      outcome: { kind: "unconfirmed" },
      recovery: { kind: "queryOriginal" },
    });
  return value;
}
/** @param {unknown} value @returns {TaskRun} */
function readTaskRun(value) {
  if (!taskRun(value)) throw new Error("Core 任务运行结构无效");
  return value;
}
/** @param {unknown} value @returns {{data:Task[],nextCursor?:string|null,hasMore?:boolean}} */
function readTaskPage(value) {
  if (
    !modelRecord(value) ||
    !Array.isArray(value.data) ||
    !value.data.every(task) ||
    (value.nextCursor != null && typeof value.nextCursor !== "string") ||
    (value.hasMore !== undefined && typeof value.hasMore !== "boolean")
  )
    throw new Error("Core 任务目录结构无效");
  return { ...value, data: value.data, nextCursor: value.nextCursor, hasMore: value.hasMore };
}
/** @param {unknown} value @returns {value is InboxEntry} */
function inboxEntry(value) {
  return (
    modelRecord(value) &&
    typeof value.taskId === "string" &&
    modelRecord(value.message) &&
    typeof value.message.id === "string" &&
    typeof value.message.runId === "string"
  );
}
/** @param {unknown} value @returns {{data:InboxEntry[],nextCursor?:string|null}} */
function readInboxPage(value) {
  if (
    !modelRecord(value) ||
    !Array.isArray(value.data) ||
    !value.data.every(inboxEntry) ||
    (value.nextCursor != null && typeof value.nextCursor !== "string")
  )
    throw new Error("Core 任务收件箱结构无效");
  return { ...value, data: value.data, nextCursor: value.nextCursor };
}
module.exports = {
  readTask,
  readTaskAdmission,
  readTaskRun,
  readTaskPage,
  readInboxPage,
  readTaskRequest,
};

/** @typedef {Record<string,unknown> & {operation:string,projectId?:string,requestId?:string,draftId?:string,viewId?:string,threadId?:string,taskId?:string,sourceThreadId?:string,turnId?:string,digest?:string,timeZone?:string,cwd?:string,effort?:string,limit?:number,expectedRevision?:number,model?:{providerId:string,modelId:string}|null}} TaskRequest */
/** @param {Record<string,unknown>} value @returns {TaskRequest} */
function readTaskRequest(value) {
  if (!taskRequest(value)) throw new Error("任务请求结构无效");
  return value;
}
/** @param {Record<string,unknown>} value @returns {value is TaskRequest} */
function taskRequest(value) {
  return (
    typeof value.operation === "string" &&
    [
      "projectId",
      "requestId",
      "draftId",
      "viewId",
      "threadId",
      "taskId",
      "sourceThreadId",
      "turnId",
      "digest",
      "timeZone",
      "cwd",
      "effort",
    ].every((key) => value[key] === undefined || typeof value[key] === "string") &&
    (value.limit === undefined || typeof value.limit === "number") &&
    (value.expectedRevision === undefined || typeof value.expectedRevision === "number") &&
    (value.model == null ||
      (modelRecord(value.model) &&
        typeof value.model.providerId === "string" &&
        typeof value.model.modelId === "string"))
  );
}
