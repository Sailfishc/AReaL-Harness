// @ts-check
"use strict";
const { performance } = require("node:perf_hooks");
const { createHash } = require("node:crypto");
const { realpath, lstat } = require("node:fs/promises");
const { dirname, basename, join } = require("node:path");
const { executeCore } = require("./core-process.cjs");
const { operationTrace } = require("./startup-timing.cjs");
const { modelRecord } = require("@areal/workbench/core-model-contract");
const {
  readTask,
  readTaskPage,
  readInboxPage,
} = require("@areal/workbench/desktop-contract/management-tasks");
const catalogContract = require("@areal/workbench/desktop-contract/catalog");
/** @typedef {InstanceType<typeof import('./backend.cjs').CoreBackend>} Backend */
/** @typedef {import('./project-state.cjs').CoreProject} Project */
/** @typedef {import('./project-index.cjs').SavedProject} SavedProject */
/** @typedef {import('@areal/workbench/desktop-contract/catalog').TasksRequest} Request */
/** @typedef {import('@areal/workbench/desktop-contract/management-tasks').Task} Task */
/** @typedef {import('@areal/workbench/desktop-contract/management-tasks').InboxEntry} InboxEntry */
/** @typedef {{kind:string,reason?:string}} Coverage */
/** @typedef {{data:Task[],hasMore:boolean,coverage:Coverage,readAt:number}} Preview */
/** @typedef {{flights:Map<string,{root:string,limit:number,sourceThreadId?:string,work:Promise<Preview>}>,active:number,queue:Array<()=>void>}} PreviewReads */
/** @typedef {{projectId:string,executionProjectId?:string,status:string,source?:string,coverage?:Coverage,readAt?:number,connectionGeneration?:number}} CatalogOwner */
/** @typedef {{projectId:string,executionProjectId?:string,projectName?:string,code:string,message:string,stage?:string}} CatalogError */
/** @typedef {{data:Record<string,unknown>[],hasMore:boolean,owner:CatalogOwner,error?:CatalogError}} CatalogResult */
/** @typedef {{data:(Task|InboxEntry)[],hasMore:boolean,connectionGeneration:number,pages:number}} CatalogRead */
/** @typedef {{connection:Promise<Awaited<ReturnType<Backend['readConnection']>>>,result:Promise<CatalogRead>,work:Promise<CatalogRead>,state:{closed:boolean,stage:string,pages:number,generation:number},limit:number}} ReadFlight */
/** @type {WeakMap<Backend,Map<string,ReadFlight>>} */
const reads = new WeakMap();
/** @type {WeakMap<Backend,PreviewReads>} */
const previews = new WeakMap();
const deadlineMs = 5000;

/** @param {string} path @returns {Promise<string>} */
async function canonicalPending(path) {
  try {
    return await realpath(path);
  } catch (error) {
    if (!modelRecord(error) || error.code !== "ENOENT") throw error;
    try {
      await lstat(path);
      throw new Error("任务数据目录不可用");
    } catch (missing) {
      if (!modelRecord(missing) || missing.code !== "ENOENT") throw missing;
    }
    return join(await canonicalPending(dirname(path)), basename(path));
  }
}

/** @param {Backend} backend @param {SavedProject} saved @param {number} limit @param {string|undefined} sourceThreadId @returns {Promise<Preview>} */
async function previewRead(backend, saved, limit, sourceThreadId) {
  let pending = previews.get(backend);
  if (!pending) {
    pending = { flights: new Map(), active: 0, queue: [] };
    previews.set(backend, pending);
  }
  const existing = pending.flights.get(saved.id);
  if (existing) {
    if (
      existing.limit === limit &&
      existing.sourceThreadId === sourceThreadId &&
      existing.root === saved.root
    )
      return existing.work;
    await existing.work.catch(() => {});
    return previewRead(backend, saved, limit, sourceThreadId);
  }
  const guard = () => {
    if (
      !backend.saved.some(
        (owner) =>
          owner.id === saved.id &&
          owner.root === saved.root &&
          owner.logicalProjectId === saved.logicalProjectId,
      )
    )
      throw new Error("任务所有者已移除");
    backend.lifecycleOperations.assertProject(saved.id);
  };
  const work = (async () => {
    guard();
    if (pending.active >= 2)
      await new Promise((resolve) => pending.queue.push(() => resolve(undefined)));
    else pending.active++;
    try {
      guard();
      const dataPath = join(backend.home, saved.id, "state");
      const [workspace, dataDir] = await Promise.all([
        realpath(saved.root),
        canonicalPending(dataPath),
      ]);
      guard();
      const { stdout } = await executeCore(
        backend.binary,
        [
          "service",
          "task-catalog",
          "--workspace",
          saved.root,
          "--data-dir",
          dataPath,
          "--limit",
          String(limit),
          ...(sourceThreadId === undefined ? [] : ["--source-thread-id", sourceThreadId]),
          "--json",
        ],
        {
          env: backend.hooks.environment(),
          timeout: deadlineMs,
          maxBuffer: 2 * 1024 * 1024,
          windowsHide: true,
        },
      );
      guard();
      /** @type {unknown} */
      const value = JSON.parse(stdout);
      /** @returns {never} */
      function invalid() {
        throw new Error("任务预览身份或数据格式不匹配");
      }
      if (
        !modelRecord(value) ||
        !modelRecord(value.target) ||
        value.version !== 1 ||
        value.source !== "published" ||
        value.executionState !== "unobserved" ||
        value.target?.workspace !== workspace ||
        value.target?.dataDir !== dataDir ||
        value.target?.instanceId !== createHash("sha256").update(dataDir).digest("hex").slice(0, 24)
      )
        invalid();
      const catalog = value.catalog;
      if (!modelRecord(catalog)) invalid();
      if (
        catalog.kind === "empty" ||
        (catalog?.kind === "requiresCore" &&
          typeof catalog.reason === "string" &&
          ["unbound", "legacyFormat", "readBudgetExceeded"].includes(catalog.reason))
      )
        return {
          data: [],
          hasMore: false,
          coverage: {
            kind: catalog.kind,
            ...(typeof catalog.reason === "string" ? { reason: catalog.reason } : {}),
          },
          readAt: Date.now(),
        };
      if (
        catalog?.kind !== "snapshot" ||
        typeof catalog.rootDigest !== "string" ||
        !/^[a-f0-9]{64}$/.test(catalog.rootDigest) ||
        typeof catalog.hasMore !== "boolean" ||
        !Array.isArray(catalog.data) ||
        catalog.data.length > limit ||
        catalog.data.some(
          /** @param {unknown} task */ (task) =>
            !modelRecord(task) ||
            typeof task.id !== "string" ||
            !task.id ||
            typeof task.objective !== "string" ||
            task.mode !== "scheduled" ||
            typeof task.revision !== "number" ||
            !Number.isSafeInteger(task.revision) ||
            task.revision < 0 ||
            !Array.isArray(task.runs) ||
            (sourceThreadId !== undefined && task.sourceThreadId !== sourceThreadId),
        )
      )
        invalid();
      return {
        data: catalog.data.map(readTask),
        hasMore: catalog.hasMore,
        coverage: { kind: "snapshot" },
        readAt: Date.now(),
      };
    } finally {
      const next = pending.queue.shift();
      if (next) next();
      else pending.active--;
    }
  })();
  pending.flights.set(saved.id, { root: saved.root, limit, sourceThreadId, work });
  try {
    return await work;
  } finally {
    if (pending.flights.get(saved.id)?.work === work) pending.flights.delete(saved.id);
  }
}

/** @param {Backend} backend @param {Request} request @param {SavedProject[]} selected @param {number} limit */
async function previewCatalog(backend, request, selected, limit) {
  /** @type {CatalogResult[]} */
  const results = [];
  const queue = selected.map((saved, index) => ({ saved, index }));
  await Promise.all(
    Array.from({ length: Math.min(2, queue.length) }, async () => {
      while (queue.length) {
        const next = queue.shift();
        if (!next) break;
        const { saved, index } = next;
        const projectId = saved.logicalProjectId ?? saved.id;
        const logical = backend.saved.find((owner) => owner.id === projectId);
        const execution = saved.logicalProjectId ? { executionProjectId: saved.id } : {};
        const projectName = logical?.projectless
          ? "独立任务"
          : backend.library.value.projects[projectId]?.title ||
            (logical?.root ?? saved.root).split(/[\\/]/).pop();
        try {
          const value = await previewRead(backend, saved, limit, request.sourceThreadId);
          results[index] = {
            data: value.data.map((task) => ({
              ...task,
              projectId,
              ...execution,
              projectName,
              scope: logical?.projectless ? "independent" : "project",
            })),
            hasMore: value.hasMore,
            owner: {
              projectId,
              status: "unobserved",
              source: "published",
              coverage: value.coverage,
              readAt: value.readAt,
            },
          };
        } catch (error) {
          let message = error instanceof Error ? error.message : String(error);
          try {
            if (modelRecord(error) && typeof error.stderr === "string") {
              /** @type {unknown} */
              const value = JSON.parse(error.stderr);
              if (
                modelRecord(value) &&
                modelRecord(value.error) &&
                typeof value.error.message === "string"
              )
                message = value.error.message;
            }
          } catch {}
          results[index] = {
            data: [],
            hasMore: false,
            owner: { projectId, status: "error" },
            error: {
              projectId,
              ...execution,
              projectName,
              code: "TASK_CATALOG_PREVIEW_FAILED",
              message: backend.providers.redact(message).slice(0, 2048),
            },
          };
        }
      }
    }),
  );
  /** @type {Map<string,CatalogOwner>} */
  const owners = new Map();
  for (const { owner } of results) {
    const previous = owners.get(owner.projectId);
    if (!previous) owners.set(owner.projectId, owner);
    else if (owner.status === "error" || previous.status === "error")
      owners.set(owner.projectId, {
        ...(previous.source ? previous : owner),
        status: "error",
        coverage: { kind: "partial" },
      });
  }
  return {
    source: "published",
    executionState: "unobserved",
    data: results.flatMap((result) => result.data),
    errors: results.flatMap((result) => (result.error ? [result.error] : [])),
    hasMore: results.some((result) => result.hasMore),
    owners: [...owners.values()],
    ...(request.projectId === undefined ? {} : { projectId: request.projectId }),
    ...(request.requestId === undefined ? {} : { requestId: request.requestId }),
    ...(request.viewEpoch === undefined ? {} : { viewEpoch: request.viewEpoch }),
  };
}

/** @template T @param {Promise<T>} work @param {number} deadline @param {()=>Error} timeout @returns {Promise<T>} */
function bounded(work, deadline, timeout) {
  /** @type {NodeJS.Timeout|undefined} */
  let timer;
  return Promise.race([
    work,
    new Promise(
      /** @param {(value:never)=>void} _ */ (_, reject) => {
        timer = setTimeout(() => reject(timeout()), Math.max(0, deadline - performance.now()));
      },
    ),
  ]).finally(() => clearTimeout(timer));
}

/** @param {Backend} backend @param {SavedProject} saved @param {boolean} inbox @param {number} limit @param {ReturnType<typeof operationTrace>} trace @param {string|undefined} sourceThreadId @param {number|undefined} deadline @param {string} [access] @returns {Promise<CatalogRead>} */
function ownerRead(
  backend,
  saved,
  inbox,
  limit,
  trace,
  sourceThreadId,
  deadline,
  access = "start",
) {
  let pending = reads.get(backend);
  if (!pending) {
    pending = new Map();
    reads.set(backend, pending);
  }
  const key = `${saved.id}:${inbox ? "inbox" : "list"}:${sourceThreadId ?? ""}:${access}`;
  const existing = pending.get(key);
  if (existing) {
    trace.advance("shared_wait", {
      connectionGeneration: existing.state.generation,
      pages: existing.state.pages,
    });
    if (!existing.state.closed && existing.limit >= limit) return existing.result;
    return existing.connection.then(() => {
      deadline ??= performance.now() + deadlineMs;
      return bounded(
        existing.work.catch(() => {}),
        deadline,
        () =>
          Object.assign(new Error("任务目录读取超时，请重试。上次读取仍在结束。"), {
            code: "TASK_CATALOG_TIMEOUT",
            stage: existing.state.stage,
          }),
      ).then(() =>
        ownerRead(backend, saved, inbox, limit, trace, sourceThreadId, deadline, access),
      );
    });
  }
  if (deadline !== undefined && performance.now() >= deadline)
    return Promise.reject(
      Object.assign(new Error("任务目录读取超时，请重试。"), {
        code: "TASK_CATALOG_TIMEOUT",
        stage: "list",
      }),
    );
  const state = { closed: false, stage: "start", pages: 0, generation: 0 };
  const timeout = () =>
    Object.assign(new Error("任务目录读取超时，请重试。后台连接仍由现有启动流程管理。"), {
      code: "TASK_CATALOG_TIMEOUT",
      stage: state.stage,
      pages: state.pages,
      connectionGeneration: state.generation,
    });
  /** @param {unknown} error @returns {never} */
  const failure = (error) => {
    if (!modelRecord(error)) throw error;
    error.stage ??= state.stage;
    error.pages ??= state.pages;
    error.connectionGeneration ??= state.generation;
    throw error;
  };
  /** @param {Project} project @param {import("@areal/runtime-client/core").CoreClient} client */
  const guard = (project, client) => {
    if (state.closed || performance.now() >= (deadline ?? Infinity)) throw timeout();
    if (!backend.saved.some((owner) => owner.id === saved.id)) throw new Error("任务所有者已移除");
    backend.lifecycleOperations.assertProject(saved.id);
    if (backend.projects.get(saved.id) !== project) throw new Error("任务所有者已移除");
    backend.requireConnection(project, client);
    if (!client.ready || (project.connectionGeneration ?? 0) !== state.generation)
      throw Object.assign(new Error("连接已换代，请重试"), { code: "STALE_CONNECTION" });
  };
  const connection = Promise.resolve()
    .then(() => {
      trace.advance("start");
      if (access === "start") return backend.readConnection(saved.id);
      const project = backend.projects.get(saved.id),
        client = project?.client;
      if (!project || !client?.ready)
        throw Object.assign(new Error("当前项目未连接，显示上次记录。"), {
          code: "TASK_CATALOG_UNOBSERVED",
        });
      return { project, client, generation: project.connectionGeneration ?? 0 };
    })
    .catch(failure);
  const work = (async () => {
    const { project, client, generation } = await connection;
    deadline ??= performance.now() + deadlineMs;
    state.generation = generation;
    state.stage = "list";
    guard(project, client);
    trace.advance("list", { connectionGeneration: state.generation });
    /** @type {Map<string,Task|InboxEntry>} */
    const data = new Map();
    /** @type {Map<string,Task>} */
    const taskRows = new Map();
    /** @type {Set<string>} */
    const cursors = new Set();
    /** @type {string|null|undefined} */
    let after;
    do {
      guard(project, client);
      const page = await client.request(inbox ? "areal/inbox/list" : "areal/task/list", {
        limit: Math.min(100, limit),
        ...(after ? { after } : {}),
      });
      guard(project, client);
      state.pages++;
      if (inbox) {
        const value = readInboxPage(page);
        for (const entry of value.data)
          data.set(`${entry.taskId}:${entry.message.runId}:${entry.message.id}`, entry);
        after = value.nextCursor;
      } else {
        const value = readTaskPage(page);
        for (const task of value.data) {
          if (
            task.mode !== "scheduled" ||
            (sourceThreadId !== undefined && task.sourceThreadId !== sourceThreadId) ||
            (task.deletedAt != null &&
              !(task.runs ?? []).some(
                (run) =>
                  !["completed", "failed", "cancelled", "skipped"].includes(run.status) ||
                  (run.workers ?? []).some((worker) => !worker.settled),
              ))
          )
            continue;
          data.set(task.id, task);
          taskRows.set(task.id, task);
        }
        after = value.nextCursor;
      }
      if (after && cursors.has(after)) throw new Error("任务列表分页未前进");
      if (after) cursors.add(after);
    } while (after && data.size < limit);
    guard(project, client);
    const rows = [...data.values()].slice(0, limit);
    if (!inbox)
      for (const task of [...taskRows.values()].slice(0, limit)) project.model.setTask(task);
    await backend.taskWorkspaceOwners?.observeTasks(project, rows);
    return {
      data: rows,
      hasMore: !!after || data.size > limit,
      connectionGeneration: state.generation,
      pages: state.pages,
    };
  })().catch(failure);
  const result = connection
    .then(() =>
      bounded(work, deadline ?? performance.now() + deadlineMs, () => {
        state.closed = true;
        return timeout();
      }),
    )
    .finally(() => {
      state.closed = true;
    });
  const flight = { connection, result, work, state, limit };
  pending.set(key, flight);
  const clear = () => {
    if (pending.get(key) === flight) pending.delete(key);
  };
  work.then(clear, clear);
  return result;
}

/** @param {Backend} backend @param {Record<string,unknown>} rawRequest */
async function taskCatalog(backend, rawRequest) {
  if (!catalogContract.isRequest("tasks", rawRequest)) throw new Error("无效任务列表请求");
  const request = rawRequest;
  const limit = request.limit ?? 30,
    inbox = request.operation === "inbox";
  const requested =
    request.projectId === undefined
      ? null
      : backend.saved.find((saved) => saved.id === request.projectId);
  if (request.projectId !== undefined && !requested) throw new Error("任务所有者不存在");
  const logicalId = requested && (requested.logicalProjectId ?? requested.id);
  const selected = requested
    ? backend.saved.filter((saved) => (saved.logicalProjectId ?? saved.id) === logicalId)
    : backend.saved;
  if (request.operation === "preview") return previewCatalog(backend, request, selected, limit);
  const trace = operationTrace("task_catalog", request);
  trace.advance("begin");
  const results = await Promise.all(
    selected.map(
      /** @returns {Promise<CatalogResult>} */ async (saved) => {
        const publicId = saved.logicalProjectId ?? saved.id;
        const logical = backend.saved.find((project) => project.id === publicId);
        const execution = saved.logicalProjectId ? { executionProjectId: saved.id } : {};
        const projectName = logical?.projectless
          ? "独立任务"
          : backend.library.value.projects[publicId]?.title ||
            (logical?.root ?? saved.root).split(/[\\/]/).pop();
        const ownerTrace = operationTrace("task_catalog.owner", {
          ...request,
          projectId: saved.id,
        });
        ownerTrace.advance("begin");
        try {
          if (request.operation === "observe" && !backend.projects.get(saved.id)?.client?.ready) {
            const preview = await previewCatalog(backend, request, [saved], limit);
            return {
              data: preview.data,
              hasMore: preview.hasMore,
              owner: preview.owners[0],
              ...(preview.errors[0] ? { error: preview.errors[0] } : {}),
            };
          }
          const result = await ownerRead(
            backend,
            saved,
            inbox,
            limit,
            ownerTrace,
            request.sourceThreadId,
            undefined,
            request.operation === "observe" ? "passive" : "start",
          );
          const data = result.data.slice(0, limit).map((task) => ({
            ...task,
            projectId: publicId,
            ...execution,
            projectName,
            scope: logical?.projectless ? "independent" : "project",
          }));
          const hasMore = result.hasMore || result.data.length > limit;
          ownerTrace.finish("ready", {
            connectionGeneration: result.connectionGeneration,
            pages: result.pages,
            rows: data.length,
          });
          return {
            data,
            hasMore,
            owner: {
              projectId: publicId,
              ...execution,
              status: "ready",
              ...(request.operation === "observe"
                ? { source: "live", coverage: { kind: "complete" }, readAt: Date.now() }
                : {}),
              connectionGeneration: result.connectionGeneration,
            },
          };
        } catch (cause) {
          const error = modelRecord(cause) ? cause : {};
          const failure = {
            projectId: publicId,
            ...execution,
            projectName,
            code: error.code === "TASK_CATALOG_TIMEOUT" ? error.code : "TASK_CATALOG_READ_FAILED",
            stage: error.stage === "start" ? "start" : "list",
            message: backend.providers.redact(
              typeof error.message === "string" ? error.message : String(cause),
            ),
          };
          ownerTrace.finish(failure.code === "TASK_CATALOG_TIMEOUT" ? "timedOut" : "error", {
            connectionGeneration:
              typeof error.connectionGeneration === "number"
                ? error.connectionGeneration
                : undefined,
            pages: typeof error.pages === "number" ? error.pages : undefined,
            rows: 0,
          });
          return {
            data: [],
            hasMore: false,
            error: failure,
            owner: { projectId: publicId, ...execution, status: "error" },
          };
        }
      },
    ),
  );
  trace.finish(results.some((result) => result.error) ? "error" : "ready", {
    rows: results.reduce((sum, result) => sum + result.data.length, 0),
  });
  /** @type {Map<string,CatalogOwner>} */
  const owners = new Map();
  for (const { owner } of results) {
    const previous = owners.get(owner.projectId);
    if (!previous) {
      const logicalOwner = { ...owner };
      delete logicalOwner.executionProjectId;
      owners.set(owner.projectId, logicalOwner);
    } else if (owner.status === "error" || previous.status === "error")
      owners.set(owner.projectId, {
        ...(previous.source ? previous : owner),
        status: "error",
        coverage: { kind: "partial" },
      });
    else if (owner.status !== "ready") owners.set(owner.projectId, owner);
  }
  return {
    data: results.flatMap((result) => result.data),
    errors: results.flatMap((result) => (result.error ? [result.error] : [])),
    hasMore: results.some((result) => result.hasMore),
    owners: [...owners.values()],
    ...(request.projectId === undefined ? {} : { projectId: request.projectId }),
    ...(request.requestId === undefined ? {} : { requestId: request.requestId }),
    ...(request.viewEpoch === undefined ? {} : { viewEpoch: request.viewEpoch }),
  };
}
module.exports = { taskCatalog };
