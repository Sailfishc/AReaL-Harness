// @ts-check
"use strict";

/** @typedef {Record<string,unknown>} Fields */
/** @typedef {{temperature?:number|null,maxOutputTokens?:number|null,contextWindowTokens?:number|null,reasoningEffort?:string|null,reasoningSummary?:string|null}} ModelParameters */
/** @typedef {{tools:boolean,vision:boolean,reasoning:boolean,reasoningEffortOptions?:string[]}} ModelCapabilities */
/** @typedef {{providerId:string,modelId:string}} ModelRef */
/** @typedef {{id:string,enabled:boolean,displayName?:string,parameters:ModelParameters,capabilities?:ModelCapabilities}} ModelConfig */
/** @typedef {{id:string,name:string,endpoint:string,protocol:string,enabled:boolean,apiKeyEnv?:string,models:ModelConfig[],parameters:ModelParameters}} ProviderConfig */
/** @typedef {Fields & {path:string,revision:string,data:ProviderConfig[],defaultModel:ModelRef|null,credentialStates:Record<string,string>,credentialSources:Record<string,string>}} ModelSnapshot */
/** @typedef {{expectedRevision:string,data:ProviderConfig[],defaultModel:ModelRef|null}} ModelUpdate */
/** @typedef {Fields & {providerId:string|null,modelId:string,providerRevision:number|null,displayName?:string,available?:boolean}} ModelCatalogEntry */
/** @typedef {Fields & {id:string,revision:number,endpoint:string,protocol:string,models:string[],modelParameters?:Record<string,ModelParameters>,parameters:ModelParameters}} CoreProvider */
/** @typedef {{revision:string,sequence:number}} AppliedConfiguration */
/** @typedef {{code:number,message:string,data?:Fields|null}} ConfigurationError */
/** @typedef {{requestId:string,state:'applied',result:ConfigurationProof}|{requestId:string,state:'rejected'|'unknown'|'running',error?:ConfigurationError}} ConfigurationOperation */
/** @typedef {{serviceId:string,generation:string,applied:AppliedConfiguration,modelRevision:string,credentialStates:Record<string,string>,operation?:ConfigurationOperation}} ConfigurationProof */
/** @typedef {{model:ModelRef|null,modelId:string,reasoningEffort:string|null,acceptedAt:number}} AcceptedModel */
/** @param {unknown} value @returns {value is Fields} */
function record(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
/** @param {unknown} value @returns {value is number} */
function integer(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
/** @param {unknown} value @returns {value is string[]} */
function strings(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
/** @param {unknown} value @returns {value is Record<string,string>} */
function stringMap(value) {
  return record(value) && Object.values(value).every((item) => typeof item === "string");
}
/** @param {unknown} value @returns {value is ModelParameters} */
function parameters(value) {
  return (
    record(value) &&
    ["temperature", "maxOutputTokens", "contextWindowTokens"].every(
      (key) =>
        value[key] == null || (typeof value[key] === "number" && Number.isFinite(value[key])),
    ) &&
    ["reasoningEffort", "reasoningSummary"].every(
      (key) => value[key] == null || typeof value[key] === "string",
    )
  );
}
/** @param {unknown} value @returns {value is ModelCapabilities} */
function capabilities(value) {
  return (
    record(value) &&
    typeof value.tools === "boolean" &&
    typeof value.vision === "boolean" &&
    typeof value.reasoning === "boolean" &&
    (value.reasoningEffortOptions === undefined || strings(value.reasoningEffortOptions))
  );
}
/** @param {unknown} value @returns {value is ModelRef} */
function modelRef(value) {
  return record(value) && typeof value.providerId === "string" && typeof value.modelId === "string";
}
/** @param {unknown} value @returns {value is ModelConfig} */
function modelConfig(value) {
  return (
    record(value) &&
    typeof value.id === "string" &&
    typeof value.enabled === "boolean" &&
    (value.displayName === undefined || typeof value.displayName === "string") &&
    parameters(value.parameters) &&
    (value.capabilities === undefined || capabilities(value.capabilities))
  );
}
/** @param {unknown} value @returns {value is ProviderConfig} */
function providerConfig(value) {
  return (
    record(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.endpoint === "string" &&
    typeof value.protocol === "string" &&
    typeof value.enabled === "boolean" &&
    (value.apiKeyEnv === undefined || typeof value.apiKeyEnv === "string") &&
    Array.isArray(value.models) &&
    value.models.every(modelConfig) &&
    parameters(value.parameters)
  );
}
/** @param {unknown} value @returns {ModelSnapshot} */
function modelSnapshot(value) {
  if (
    !record(value) ||
    typeof value.path !== "string" ||
    typeof value.revision !== "string" ||
    !Array.isArray(value.data) ||
    !value.data.every(providerConfig) ||
    (value.defaultModel !== null && !modelRef(value.defaultModel)) ||
    !stringMap(value.credentialStates) ||
    !stringMap(value.credentialSources)
  )
    throw new Error("Core 返回了无效的模型配置");
  return {
    ...value,
    path: value.path,
    revision: value.revision,
    data: value.data,
    defaultModel: value.defaultModel,
    credentialStates: value.credentialStates,
    credentialSources: value.credentialSources,
  };
}
/** @param {unknown} value @returns {value is CoreProvider} */
function coreProvider(value) {
  return (
    record(value) &&
    typeof value.id === "string" &&
    integer(value.revision) &&
    typeof value.endpoint === "string" &&
    typeof value.protocol === "string" &&
    strings(value.models) &&
    parameters(value.parameters) &&
    (value.modelParameters === undefined ||
      (record(value.modelParameters) && Object.values(value.modelParameters).every(parameters)))
  );
}
/** @param {unknown} value @returns {CoreProvider} */
function provider(value) {
  if (!coreProvider(value)) throw new Error("Core 供应商记录无效");
  return value;
}
/** @param {unknown} value @returns {{data:CoreProvider[]}} */
function providers(value) {
  if (!record(value) || !Array.isArray(value.data) || !value.data.every(coreProvider))
    throw new Error("Core 供应商目录无效");
  return { data: value.data };
}
/** @param {unknown} value @returns {value is ModelCatalogEntry} */
function modelEntry(value) {
  return (
    record(value) &&
    (value.providerId === null || typeof value.providerId === "string") &&
    typeof value.modelId === "string" &&
    (value.providerRevision === null || integer(value.providerRevision)) &&
    (value.displayName === undefined || typeof value.displayName === "string") &&
    (value.available === undefined || typeof value.available === "boolean")
  );
}
/** @param {unknown} value @returns {{data:ModelCatalogEntry[],lastAcceptedModel?:AcceptedModel|null}} */
function models(value) {
  if (!record(value) || !Array.isArray(value.data) || !value.data.every(modelEntry))
    throw new Error("Core 模型目录无效");
  return {
    data: value.data,
    ...(value.lastAcceptedModel === undefined
      ? {}
      : {
          lastAcceptedModel:
            value.lastAcceptedModel === null ? null : acceptedModel(value.lastAcceptedModel),
        }),
  };
}
/** @param {unknown} value @returns {value is ConfigurationError} */
function configurationError(value) {
  return (
    record(value) &&
    typeof value.code === "number" &&
    typeof value.message === "string" &&
    (value.data == null || record(value.data))
  );
}
/** @param {unknown} value @returns {value is ConfigurationProof} */
function proofRecord(value) {
  return (
    record(value) &&
    typeof value.serviceId === "string" &&
    typeof value.generation === "string" &&
    record(value.applied) &&
    typeof value.applied.revision === "string" &&
    integer(value.applied.sequence) &&
    typeof value.modelRevision === "string" &&
    stringMap(value.credentialStates) &&
    (value.operation === undefined || operation(value.operation))
  );
}
/** @param {unknown} value @returns {value is ConfigurationOperation} */
function operation(value) {
  return (
    record(value) &&
    typeof value.requestId === "string" &&
    (value.state === "applied"
      ? proofRecord(value.result)
      : (value.state === "rejected" || value.state === "unknown" || value.state === "running") &&
        (value.error === undefined || configurationError(value.error)))
  );
}
/** @param {unknown} value @returns {ConfigurationProof} */
function configurationProof(value) {
  if (!proofRecord(value)) throw new Error("Core 模型配置应用证明无效，请刷新核对。");
  return value;
}
/** @param {unknown} value @returns {{restartSafe:boolean}} */
function serverStatus(value) {
  if (!record(value) || typeof value.restartSafe !== "boolean")
    throw new Error("Core 服务状态无效");
  return { restartSafe: value.restartSafe };
}
/** @param {unknown} value @returns {AcceptedModel} */
function acceptedModel(value) {
  if (
    !record(value) ||
    (value.model !== null && !modelRef(value.model)) ||
    typeof value.modelId !== "string" ||
    (value.reasoningEffort !== null && typeof value.reasoningEffort !== "string") ||
    !integer(value.acceptedAt)
  )
    throw new Error("模型选择记录无效");
  return {
    model: value.model,
    modelId: value.modelId,
    reasoningEffort: value.reasoningEffort,
    acceptedAt: value.acceptedAt,
  };
}
module.exports = {
  record,
  integer,
  strings,
  stringMap,
  parameters,
  capabilities,
  modelRef,
  modelConfig,
  providerConfig,
  modelSnapshot,
  provider,
  providers,
  models,
  configurationProof,
  serverStatus,
  acceptedModel,
};
