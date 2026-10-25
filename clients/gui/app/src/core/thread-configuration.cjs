// @ts-check
"use strict";
const { modelRecord } = require("@areal/workbench/core-model-contract");
/** The consumed part of protocol::desktop::EffectiveConfig; extensions stay unknown. */
/** @typedef {Record<string,unknown> & {revision?:number,model?:({providerId:string,modelId:string,[key:string]:unknown})|null,options?:Record<string,unknown>&{appendInstructions?:string},defaultModelRevision?:string|null,modelName?:unknown,provider?:(Record<string,unknown>&{endpoint?:string})|null,parameters?:Record<string,unknown>}} Configuration */
/** @typedef {Record<string,unknown> & {configuration:Configuration & {revision:number},activeTurnId?:string|null,modelName?:unknown,resolvedParameters?:unknown}} Inspection */
/** @param {unknown} value @returns {value is Configuration} */
function isConfiguration(value) {
  return (
    modelRecord(value) &&
    (value.revision === undefined ||
      (typeof value.revision === "number" && Number.isSafeInteger(value.revision))) &&
    (value.model == null ||
      (modelRecord(value.model) &&
        typeof value.model.providerId === "string" &&
        typeof value.model.modelId === "string")) &&
    (value.options === undefined ||
      (modelRecord(value.options) &&
        (value.options.appendInstructions === undefined ||
          typeof value.options.appendInstructions === "string"))) &&
    (value.defaultModelRevision == null || typeof value.defaultModelRevision === "string") &&
    (value.provider == null ||
      (modelRecord(value.provider) &&
        (value.provider.endpoint === undefined || typeof value.provider.endpoint === "string"))) &&
    (value.parameters === undefined || modelRecord(value.parameters))
  );
}
/** @param {unknown} value @returns {Inspection} */
function readInspection(value) {
  if (!isInspection(value))
    throw Object.assign(new Error("Core 未返回有效的会话配置，请重新打开任务"), {
      code: "THREAD_CONFIGURATION_INVALID",
    });
  return value;
}
/** @param {unknown} value @returns {value is Inspection} */
function isInspection(value) {
  return (
    modelRecord(value) &&
    isConfiguration(value.configuration) &&
    typeof value.configuration.revision === "number" &&
    (value.activeTurnId == null || typeof value.activeTurnId === "string")
  );
}
/** @param {unknown} value @returns {Configuration & {revision:number}} */
function readConfigured(value) {
  if (!isConfiguration(value) || typeof value.revision !== "number")
    throw Object.assign(new Error("会话配置受理结果无效，请查询原请求"), {
      code: "THREAD_CONFIGURATION_INVALID",
      submissionUnknown: true,
      outcome: { kind: "unconfirmed" },
      recovery: { kind: "queryOriginal" },
    });
  return { ...value, revision: value.revision };
}
module.exports = { isConfiguration, readInspection, readConfigured };
