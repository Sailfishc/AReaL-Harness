// @ts-check
"use strict";
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { record } = require("./service-transport-contract.cjs");
const { readCommandInvocation } = require("@areal/workbench/desktop-contract");
const { TrajectoryApply } = require("./trajectory-apply.cjs");
const execute = promisify(execFile);

/** @returns {never} */
function invalid() {
  throw new Error("Core 返回了无效的数据飞轮状态，请检查 Core 版本");
}
/** @param {unknown} value */
function text(value) {
  if (typeof value !== "string") invalid();
  return value;
}
/** @param {unknown} value */
function optionalText(value) {
  return value == null ? null : text(value);
}
/** @param {unknown} value */
function count(value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) invalid();
  return value;
}
/** @param {unknown} value */
function timestamp(value) {
  return value == null ? null : count(value);
}
/** @param {unknown} value */
function duration(value) {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) invalid();
  return value;
}
/** @param {Record<string,unknown>} record */
function modelDuration(record) {
  if (!Object.hasOwn(record, "model_call_duration_ms")) return {};
  const value = duration(record.model_call_duration_ms);
  if (value != null && record.event_name !== "gen_ai.client.inference.operation.details") invalid();
  return { model_call_duration_ms: value };
}
/** @param {unknown} value @param {number} recordCount @returns {import("@areal/workbench/desktop-contract").TrajectoryModelCallSummary} */
function modelSummary(value, recordCount) {
  if (!record(value) || value.scope !== "recent_records" || value.record_limit !== 100) invalid();
  const considered = count(value.records_considered),
    calls = count(value.model_calls);
  if (considered !== recordCount || considered > 100 || calls > considered) invalid();
  const total = duration(value.total_duration_ms),
    mean = duration(value.mean_duration_ms),
    maximum = duration(value.max_duration_ms);
  // 旧记录没有计时不补零；总和溢出时 Core 可保留有效最大值并将总和/平均标为未知。
  if (
    (total == null) !== (mean == null) ||
    (calls === 0 ? total != null || maximum != null : maximum == null)
  )
    invalid();
  return {
    scope: "recent_records",
    record_limit: 100,
    records_considered: considered,
    model_calls: calls,
    total_duration_ms: total,
    mean_duration_ms: mean,
    max_duration_ms: maximum,
  };
}
/** @param {unknown} value */
function boolean(value) {
  if (typeof value !== "boolean") invalid();
  return value;
}
/** @template {string} T @param {unknown} value @param {T[]} allowed @returns {T} */
function choice(value, allowed) {
  const found = allowed.find((item) => item === value);
  if (found === undefined) invalid();
  return found;
}

// 只向界面投影已约定的状态字段，Core 新增字段不会自动穿过 IPC。
/** @param {unknown} value @returns {import("@areal/workbench/desktop-contract").TrajectoryStatus} */
function publicStatus(value) {
  if (
    !record(value) ||
    !Array.isArray(value.records) ||
    !record(value.queue) ||
    !record(value.limits)
  )
    invalid();
  const queue = value.queue,
    limits = value.limits;
  return {
    enabled: boolean(value.enabled),
    ...(Object.hasOwn(value, "config_revision")
      ? {
          config_revision:
            value.config_revision === "missing" ||
            /^[a-f0-9]{64}$/.test(text(value.config_revision))
              ? text(value.config_revision)
              : invalid(),
        }
      : {}),
    state: choice(value.state, ["disabled", "ready", "degraded", "invalid"]),
    endpoint: text(value.endpoint),
    configPath: optionalText(value.configPath),
    spool_dir: text(value.spool_dir),
    worker_running: boolean(value.worker_running),
    queue: {
      pending: count(queue.pending),
      uploading: count(queue.uploading),
      failed: count(queue.failed),
      uploaded: count(queue.uploaded),
      evicted: count(queue.evicted),
      bytes: count(queue.bytes),
      max_bytes: count(queue.max_bytes),
      dropped_memory: count(queue.dropped_memory),
      dropped_oversize: count(queue.dropped_oversize),
    },
    last_error: optionalText(value.last_error),
    last_success_at: timestamp(value.last_success_at),
    records: value.records.slice(0, 100).map((entry) => {
      if (!record(entry)) invalid();
      return {
        id: text(entry.id),
        status: choice(entry.status, ["pending", "uploading", "failed", "uploaded", "evicted"]),
        created_at: count(entry.created_at),
        uploaded_at: timestamp(entry.uploaded_at),
        attempts: count(entry.attempts),
        next_attempt_at: timestamp(entry.next_attempt_at),
        bytes: count(entry.bytes),
        error: optionalText(entry.error),
        ...Object.fromEntries(
          ["turn_id", "event_name", "model_name", "harness_version"]
            .filter((key) => Object.hasOwn(entry, key))
            .map((key) => [key, optionalText(entry[key])]),
        ),
        ...Object.fromEntries(
          ["execution_duration_ms", "occurred_at"]
            .filter((key) => Object.hasOwn(entry, key))
            .map((key) => [key, timestamp(entry[key])]),
        ),
        ...modelDuration(entry),
      };
    }),
    ...(Object.hasOwn(value, "model_call_summary")
      ? {
          model_call_summary: modelSummary(
            value.model_call_summary,
            Math.min(value.records.length, 100),
          ),
        }
      : {}),
    limits: {
      max_retries: count(limits.max_retries),
      upload_interval_ms: count(limits.upload_interval_ms),
      max_memory_bytes: count(limits.max_memory_bytes),
    },
  };
}

class TrajectoryExport {
  /** @param {InstanceType<typeof import("./backend.cjs").CoreBackend>} backend */
  constructor(backend) {
    this.backend = backend;
    this.apply = new TrajectoryApply(backend);
  }
  /** @param {import("@areal/workbench/desktop-contract").TrajectoryRequest} request */
  async setEnabled(request) {
    readCommandInvocation("trajectory", request);
    if (request.operation !== "setEnabled") invalid();
    const backend = this.backend;
    if (
      backend.closing ||
      backend.providerUpdating ||
      backend.resourcesUpdating ||
      backend.activeCommands ||
      backend.starting.size
    )
      throw new Error("配置正在应用，请稍后重试");
    backend.providerUpdating = true;
    let value;
    try {
      value = await this.command(request);
      const current = await backend.providers.config.current();
      this.apply.schedule(current.revision);
    } catch (error) {
      if (!value) throw error;
      // 上传开关可能已经写入；采集核验失败必须在后续轮询中继续可见。
      clearTimeout(this.apply.timer);
      this.apply.revision = null;
      this.apply.error = `上传控制已应用，但无法核验采集配置：${backend.providers.redact(error instanceof Error ? error.message : String(error))}。请在后台服务中安全应用配置。`;
    } finally {
      backend.providerUpdating = false;
    }
    await this.apply.tryApply();
    if (!value) invalid();
    return this.apply.project(value);
  }
  /** @param {import("@areal/workbench/desktop-contract").TrajectoryRequest} request */
  async command(request) {
    readCommandInvocation("trajectory", request);
    const args =
      request.operation === "setEnabled"
        ? [
            "trajectory",
            "set-enabled",
            String(request.enabled),
            "--expected-revision",
            request.expectedRevision,
          ]
        : ["trajectory", request.operation];
    if (this.backend.config) args.push("--config", this.backend.config);
    let stdout;
    try {
      ({ stdout } = await execute(this.backend.binary, args, {
        // 重试可能启动上传进程，须与 Core 启动继承同一凭据环境；只读状态不解密凭据。
        env: {
          ...this.backend.hooks.environment(),
          ...(request.operation !== "status" ? this.backend.providers.environment() : {}),
        },
        timeout: 15000,
        maxBuffer: 2 * 1024 * 1024,
      }));
    } catch (error) {
      const detail = this.backend.providers
        .redact(
          error instanceof Error && "stderr" in error && typeof error.stderr === "string"
            ? error.stderr
            : error instanceof Error
              ? error.message
              : String(error),
        )
        .slice(0, 2048);
      throw new Error(
        `数据飞轮${request.operation === "setEnabled" ? "启停" : request.operation === "retry" ? "重试" : "状态读取"}失败：${detail}`,
      );
    }
    /** @type {unknown} */
    let value;
    try {
      value = JSON.parse(stdout);
    } catch {
      invalid();
    }
    return this.apply.project(publicStatus(value));
  }
}

module.exports = { TrajectoryExport, publicStatus };
