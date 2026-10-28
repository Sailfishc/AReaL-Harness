// @ts-check
"use strict";
const providerContract = require("./provider-contract.cjs");
const { validContextWindow } = providerContract;
const { readFile, appendFile } = require("node:fs/promises");
const { join } = require("node:path");

// 凭据存储与 OAuth 使用同一串行读写契约。
class SubscriptionStore {
  /** @param {{home:string,save:(name:string,value:unknown)=>Promise<void>}} backend @param {import("electron").SafeStorage} [encryption] */
  constructor(backend, encryption) {
    this.filename = "openai-subscription.json";
    this.backend = backend;
    this.encryption = encryption;
    /** @type {Promise<unknown>} */
    this.chain = Promise.resolve();
  }
  /** @returns {import("electron").SafeStorage} */
  check() {
    if (
      !this.encryption?.isEncryptionAvailable() ||
      this.encryption.getSelectedStorageBackend?.() === "basic_text"
    )
      throw Object.assign(new Error("系统安全存储不可用，请解锁后重试"), {
        code: "storage_locked",
      });
    return this.encryption;
  }
  /** @returns {Promise<unknown>} */
  async readRecord() {
    try {
      /** @type {unknown} */
      const record = JSON.parse(await readFile(join(this.backend.home, this.filename), "utf8"));
      if (!record || typeof record !== "object" || !("secret" in record))
        throw new Error("订阅凭据记录无效");
      if (record.secret == null || record.secret === "") return undefined;
      if (typeof record.secret !== "string") throw new Error("订阅凭据记录无效");
      const encryption = this.check();
      return JSON.parse(encryption.decryptString(Buffer.from(record.secret, "base64")));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
      throw Object.assign(new Error("无法读取 ChatGPT 登录，请解锁系统安全存储后重试"), {
        code: "storage_locked",
      });
    }
  }
  /** @param {unknown} _key @param {(current:unknown)=>unknown|Promise<unknown>} mutate */
  modifyRecord(_key, mutate) {
    const result = this.chain.then(async () => {
      const current = await this.readRecord(),
        next = await mutate(current);
      if (next === undefined) return current;
      const encryption = this.check();
      try {
        await this.backend.save(this.filename, {
          secret: encryption.encryptString(JSON.stringify(next)).toString("base64"),
        });
      } catch {
        throw Object.assign(new Error("ChatGPT 凭据轮换尚未保存，请重试"), {
          code: "storage_write_failed",
        });
      }
      return next;
    });
    this.chain = result.catch(() => {});
    return result;
  }
  deleteRecord() {
    const result = this.chain.then(() => this.backend.save(this.filename, { secret: null }));
    this.chain = result.catch(() => {});
    return result;
  }
}
/** @param {unknown} value */
function transportRecord(value) {
  if (
    !providerContract.record(value) ||
    typeof value.token !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.token) ||
    typeof value.port !== "number" ||
    !Number.isInteger(value.port) ||
    value.port < 0 ||
    value.port > 65535
  )
    throw new Error("本地订阅传输配置无效");
  return { token: value.token, port: value.port };
}

/** @param {import('@areal/workbench/desktop-contract/provider').SubscriptionModel[]} models */
function publicSubscriptionModels(models) {
  return models.map((model) => ({
    id: model.id,
    ...(model.name ? { name: model.name } : {}),
    ...(model.source ? { source: model.source } : {}),
    ...(model.reasoningEffortOptions
      ? { reasoningEffortOptions: model.reasoningEffortOptions }
      : {}),
    ...(validContextWindow(model.parameters?.contextWindowTokens)
      ? { parameters: { contextWindowTokens: model.parameters.contextWindowTokens } }
      : {}),
  }));
}

/** @param {string} home @returns {(audit:import('@areal/chatgpt-provider/core').RequestAudit)=>Promise<void>} */
function requestAudit(home) {
  return async ({
    providerId,
    protocol,
    model,
    startedAt,
    completedAt,
    upstreamHttpStatus,
    upstreamContentType,
    localHttpStatus,
    outcome,
    failureKind,
    streamFailureReason,
    code,
    state,
    phase,
    httpStatus,
    requestId,
    adjustments,
    sessionIdentitySent,
    turnStateSent,
    turnStateReceived,
  }) => {
    await appendFile(
      join(home, "provider-requests.jsonl"),
      JSON.stringify({
        providerId,
        protocol,
        model,
        startedAt,
        completedAt,
        upstreamHttpStatus,
        upstreamContentType,
        localHttpStatus,
        outcome,
        failureKind,
        streamFailureReason,
        code,
        state,
        phase,
        httpStatus,
        requestId,
        adjustments,
        sessionIdentitySent,
        turnStateSent,
        turnStateReceived,
      }) + "\n",
      { mode: 0o600 },
    );
  };
}

/** @param {import('@areal/workbench/desktop-contract/provider').SubscriptionModel[]} models */
function subscriptionContexts(models) {
  return Object.fromEntries(
    models.flatMap((m) =>
      validContextWindow(m.parameters?.contextWindowTokens)
        ? [[m.id, { contextWindowTokens: m.parameters.contextWindowTokens }]]
        : [],
    ),
  );
}

module.exports = {
  subscriptionContexts,
  requestAudit,
  transportRecord,
  publicSubscriptionModels,
  SubscriptionStore,
};
