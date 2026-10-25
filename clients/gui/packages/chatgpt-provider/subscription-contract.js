// @ts-check
/** @typedef {{id:string,name?:string,source?:string,parameters?:{contextWindowTokens:number}}} SubscriptionModel */
/** @typedef {Record<string,unknown> & {authenticated:boolean,state:string,modelError:string|null,models:SubscriptionModel[],diagnostic:unknown}} AccountStatus */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
export function record(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
/** @param {unknown} value @returns {SubscriptionModel[]} */
export function subscriptionModels(value) {
  if (!Array.isArray(value) || !value.every(subscriptionModel))
    throw new Error("ChatGPT 模型目录无效");
  return value;
}
/** @param {unknown} item @returns {item is SubscriptionModel} */
function subscriptionModel(item) {
  return (
    record(item) &&
    typeof item.id === "string" &&
    (item.name === undefined || typeof item.name === "string") &&
    (item.source === undefined || typeof item.source === "string") &&
    (item.parameters === undefined ||
      (record(item.parameters) &&
        typeof item.parameters.contextWindowTokens === "number" &&
        Number.isSafeInteger(item.parameters.contextWindowTokens) &&
        item.parameters.contextWindowTokens > 0))
  );
}
/** @param {unknown} value @returns {AccountStatus} */
export function accountStatus(value) {
  if (
    !record(value) ||
    typeof value.authenticated !== "boolean" ||
    typeof value.state !== "string" ||
    (value.modelError !== null && typeof value.modelError !== "string")
  )
    throw new Error("ChatGPT 账号状态无效");
  return {
    ...value,
    authenticated: value.authenticated,
    state: value.state,
    modelError: value.modelError,
    models: subscriptionModels(value.models),
    diagnostic: value.diagnostic,
  };
}
