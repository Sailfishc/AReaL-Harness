// @ts-check
"use strict";
const { isDeepStrictEqual } = require("node:util");
const { KINDS } = require("./lifecycle-operations.cjs");
/** @typedef {import('./lifecycle-operations.cjs').LifecycleKind} Kind */
/** @typedef {import('./lifecycle-operations.cjs').LifecycleMode} Mode */
/** @typedef {import('./lifecycle-operations.cjs').TargetPhase} TargetPhase */
/** @typedef {{projectId:string,serviceId:string|null,generation:string|null,phase?:unknown,error?:unknown}} ReferenceTarget */
/** @typedef {{pid:number,identity:string}} DesktopIdentity */
/** @typedef {{requestId:string,desktopGeneration:string,kind:Kind,mode:Mode,targets:ReferenceTarget[],desktop:DesktopIdentity,threadId?:string,turnId?:string,logicalProjectId?:string}} LifecycleReference */
/** @typedef {{projectId:string,serviceId:string,generation:string,phase:TargetPhase,error?:unknown,[key:string]:unknown}} ResponseTarget */
/** @typedef {{version:1,requestId:string,desktopGeneration:string,kind:Kind,mode:Mode,targets:ResponseTarget[],phase:Exclude<TargetPhase,'notAttempted'>|'partial',desktopExit:'notRequested'|'requested',threadId?:unknown,turnId?:unknown,message?:unknown,desktopError?:unknown,logicalProjectId?:unknown,[key:string]:unknown}} LifecycleResponse */

/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** @param {unknown} value @returns {value is string} */
function uuid(value) {
  return (
    typeof value === "string" &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)
  );
}
/** @param {unknown} value @returns {value is Kind} */
function kind(value) {
  return KINDS.some((kind) => kind === value);
}
/** @param {unknown} value @returns {value is ReferenceTarget} */
function referenceTarget(value) {
  return (
    record(value) &&
    typeof value.projectId === "string" &&
    (value.serviceId === null || typeof value.serviceId === "string") &&
    (value.generation === null || typeof value.generation === "string")
  );
}
/** @param {unknown} value @returns {value is LifecycleReference} */
function reference(value) {
  return (
    record(value) &&
    uuid(value.requestId) &&
    uuid(value.desktopGeneration) &&
    kind(value.kind) &&
    (value.mode === "ifIdle" || value.mode === "cancel") &&
    Array.isArray(value.targets) &&
    value.targets.every(referenceTarget) &&
    record(value.desktop) &&
    typeof value.desktop.pid === "number" &&
    Number.isSafeInteger(value.desktop.pid) &&
    value.desktop.pid > 1 &&
    typeof value.desktop.identity === "string" &&
    ["threadId", "turnId", "logicalProjectId"].every(
      (key) => value[key] === undefined || typeof value[key] === "string",
    ) &&
    (value.kind !== "interruptTurn" ||
      (typeof value.threadId === "string" && typeof value.turnId === "string"))
  );
}
/** @param {unknown} value @returns {LifecycleReference[]} */
function readReferences(value) {
  if (!Array.isArray(value) || !value.every(reference))
    throw Object.assign(new Error("后台操作引用损坏，请保留记录并检查原后台"), {
      code: "LIFECYCLE_REFERENCE_INVALID",
    });
  return value;
}
/** @param {unknown} value @returns {value is ResponseTarget} */
function responseTarget(value) {
  return (
    record(value) &&
    typeof value.projectId === "string" &&
    typeof value.serviceId === "string" &&
    typeof value.generation === "string" &&
    [
      "notAttempted",
      "acceptedPending",
      "blocked",
      "admissionUnconfirmed",
      "settlementIncomplete",
      "completed",
    ].some((phase) => phase === value.phase)
  );
}
/** @param {LifecycleReference} reference @param {unknown} value @returns {value is LifecycleResponse} */
function lifecycleResponse(reference, value) {
  return (
    record(value) &&
    value.version === 1 &&
    value.requestId === reference.requestId &&
    value.desktopGeneration === reference.desktopGeneration &&
    value.kind === reference.kind &&
    value.mode === reference.mode &&
    Array.isArray(value.targets) &&
    value.targets.every(responseTarget) &&
    [
      "acceptedPending",
      "blocked",
      "partial",
      "admissionUnconfirmed",
      "settlementIncomplete",
      "completed",
    ].some((phase) => phase === value.phase) &&
    (value.desktopExit === "notRequested" || value.desktopExit === "requested") &&
    (value.phase !== "completed" ||
      value.targets.every((target) => target.phase === "completed")) &&
    isDeepStrictEqual(require("./lifecycle.cjs").targets(value.targets), reference.targets) &&
    (reference.kind !== "interruptTurn" ||
      (value.threadId === reference.threadId && value.turnId === reference.turnId))
  );
}
/** @param {LifecycleReference} reference @param {unknown} value @returns {LifecycleResponse} */
function readLifecycleResponse(reference, value) {
  if (!lifecycleResponse(reference, value))
    throw Object.assign(new Error("后台回执与原操作身份不一致"), {
      code: "LIFECYCLE_RECEIPT_INVALID",
      submissionUnknown: true,
    });
  return value;
}
module.exports = { readReferences, readLifecycleResponse };
