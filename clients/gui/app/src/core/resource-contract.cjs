// @ts-check
"use strict";
/** @typedef {Record<string,unknown>} Fields */
/** @typedef {{type:'stdio',command:string,args:string[],cwd:string|null,envVars:string[]}|{type:'streamableHttp',url:string,bearerTokenEnv:string|null}} McpTransport */
/** @typedef {{transport:McpTransport,startupTimeoutMs:number,callTimeoutMs:number|null,enabledTools:string[]|null}} McpConfig */
/** @typedef {{id:string,runtimeId:string,config:McpConfig}} UserMcp */
/** @typedef {{revision:number,skills:Record<string,Record<string,boolean>>,mcp:UserMcp[]}} ResourceState */
/** @typedef {{id:string,scope:string,managed:boolean,enabled:boolean,root:string,name:string,description:string,revision:string,error?:undefined}} AvailableSkill */
/** @typedef {AvailableSkill|{id:string,scope:string,managed:boolean,enabled:false,name:string,root?:string,error:string}} Skill */
/** @typedef {{id:string,revision:string,root:string,metadata:{name:string,description:string}}} DeployedSkill */
/** @typedef {Fields & {id:string,revision:number,state:string,config:unknown}} McpServer */
/** @typedef {Fields & {pluginId:string,installedDigest:string,trusted:boolean,state:string}} PluginConnection */
/** @param {unknown} value @returns {value is Fields} */
function record(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
/** @param {unknown} value @returns {value is string[]} */
function strings(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
/** @param {unknown} value @returns {ResourceState} */
function resources(value) {
  if (
    !record(value) ||
    typeof value.revision !== "number" ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    !record(value.skills) ||
    !Array.isArray(value.mcp)
  )
    throw new Error("资源配置记录无效");
  const skills = Object.fromEntries(
    Object.entries(value.skills).map(([scope, entries]) => {
      if (!record(entries)) throw new Error("技能启用记录无效");
      return [
        scope,
        Object.fromEntries(
          Object.entries(entries).map(([id, enabled]) => {
            if (typeof enabled !== "boolean") throw new Error("技能启用记录无效");
            return [id, enabled];
          }),
        ),
      ];
    }),
  );
  const mcp = value.mcp.map((item) => {
    if (!record(item) || typeof item.id !== "string" || typeof item.runtimeId !== "string")
      throw new Error("MCP 配置记录无效");
    return { id: item.id, runtimeId: item.runtimeId, config: normalizeMcp(item.config) };
  });
  return { revision: value.revision, skills, mcp };
}
/** @param {unknown} value @returns {DeployedSkill[]} */
function deployedSkills(value) {
  if (!Array.isArray(value)) throw new Error("技能部署记录无效");
  return value.map((item) => {
    if (
      !record(item) ||
      typeof item.id !== "string" ||
      typeof item.revision !== "string" ||
      typeof item.root !== "string" ||
      !record(item.metadata) ||
      typeof item.metadata.name !== "string" ||
      typeof item.metadata.description !== "string"
    )
      throw new Error("技能部署记录无效");
    return {
      id: item.id,
      revision: item.revision,
      root: item.root,
      metadata: { name: item.metadata.name, description: item.metadata.description },
    };
  });
}
/** @param {unknown} value */
function deployment(value) {
  if (!record(value) || !Array.isArray(value.profiles) || !value.profiles.length)
    throw new Error("桌面资源配置无效");
  const profiles = value.profiles.map((item) => {
    if (!record(item) || typeof item.id !== "string" || typeof item.revision !== "string")
      throw new Error("桌面任务配置无效");
    return { ...item, id: item.id, revision: item.revision };
  });
  return { ...value, profiles };
}
/** @param {unknown} value @returns {{data:McpServer[]}} */
function mcpServers(value) {
  if (!record(value) || !Array.isArray(value.data)) throw new Error("Core MCP 目录无效");
  const data = value.data.map((item) => {
    if (
      !record(item) ||
      typeof item.id !== "string" ||
      typeof item.revision !== "number" ||
      !Number.isSafeInteger(item.revision) ||
      typeof item.state !== "string"
    )
      throw new Error("Core MCP 记录无效");
    return {
      ...item,
      id: item.id,
      revision: item.revision,
      state: item.state,
      config: item.config,
    };
  });
  return { data };
}
/** @param {unknown} value @returns {{data:PluginConnection[]}} */
function pluginConnections(value) {
  if (!record(value) || !Array.isArray(value.data)) throw new Error("Core 插件连接目录无效");
  const data = value.data.map((item) => {
    if (
      !record(item) ||
      typeof item.pluginId !== "string" ||
      typeof item.installedDigest !== "string" ||
      typeof item.trusted !== "boolean" ||
      typeof item.state !== "string"
    )
      throw new Error("Core 插件连接记录无效");
    return {
      ...item,
      pluginId: item.pluginId,
      installedDigest: item.installedDigest,
      trusted: item.trusted,
      state: item.state,
    };
  });
  return { data };
}
/** @param {unknown} value */
function availableSkills(value) {
  if (!record(value) || !Array.isArray(value.data)) throw new Error("Core 技能目录无效");
  const data = value.data.map((item) => {
    if (
      !record(item) ||
      typeof item.id !== "string" ||
      typeof item.revision !== "string" ||
      typeof item.available !== "boolean"
    )
      throw new Error("Core 技能记录无效");
    return { ...item, id: item.id, revision: item.revision, available: item.available };
  });
  return { data };
}
/** @param {unknown} raw @returns {McpConfig} */
function normalizeMcp(raw) {
  if (!record(raw)) throw new Error("无效 MCP 配置");
  const t = raw.transport;
  /** @param {unknown} v @returns {v is string} */
  const env = (v) => typeof v === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(v);
  /** @param {Fields} object @param {string[]} allowed */
  const keys = (object, allowed) => {
    if (Object.keys(object).some((k) => !allowed.includes(k)))
      throw new Error("MCP 配置包含不支持的字段");
  };
  keys(raw, ["transport", "startupTimeoutMs", "callTimeoutMs", "enabledTools"]);
  if (!record(t)) throw new Error("请配置 MCP transport");
  /** @type {McpTransport} */ let transport;
  if (t.type === "stdio") {
    keys(t, ["type", "command", "args", "cwd", "envVars"]);
    const args = t.args ?? [];
    const envVars = t.envVars ?? [];
    if (
      typeof t.command !== "string" ||
      !t.command.trim() ||
      t.command.includes("\0") ||
      !strings(args) ||
      args.length > 256 ||
      args.some((a) => a.includes("\0")) ||
      !strings(envVars) ||
      envVars.length > 64 ||
      envVars.some((e) => !env(e)) ||
      (t.cwd != null && (typeof t.cwd !== "string" || !t.cwd))
    )
      throw new Error("MCP 命令、参数或环境变量名称无效");
    transport = {
      type: t.type,
      command: t.command,
      args,
      cwd: t.cwd ?? null,
      envVars,
    };
  } else if (t.type === "streamableHttp") {
    keys(t, ["type", "url", "bearerTokenEnv"]);
    if (typeof t.url !== "string") throw new Error("MCP URL 无效");
    let url;
    try {
      url = new URL(t.url);
    } catch {
      throw new Error("MCP URL 无效");
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.hash ||
      (t.bearerTokenEnv != null && !env(t.bearerTokenEnv))
    )
      throw new Error("MCP URL 或认证环境变量名称无效");
    transport = {
      type: t.type,
      url: t.url,
      bearerTokenEnv: t.bearerTokenEnv ?? null,
    };
  } else throw new Error("不支持的 MCP transport");
  const startupTimeoutMs = raw.startupTimeoutMs ?? 30000,
    callTimeoutMs = raw.callTimeoutMs === undefined ? 120000 : raw.callTimeoutMs;
  if (
    typeof startupTimeoutMs !== "number" ||
    !Number.isSafeInteger(startupTimeoutMs) ||
    startupTimeoutMs <= 0 ||
    (callTimeoutMs !== null &&
      (typeof callTimeoutMs !== "number" ||
        !Number.isSafeInteger(callTimeoutMs) ||
        callTimeoutMs <= 0))
  )
    throw new Error("MCP 超时必须为正整数");
  const enabledTools = raw.enabledTools ?? null;
  if (
    enabledTools !== null &&
    (!strings(enabledTools) ||
      enabledTools.length > 128 ||
      enabledTools.some((v) => typeof v !== "string" || !v || v.length > 256))
  )
    throw new Error("无效工具列表");
  const result = { transport, startupTimeoutMs, callTimeoutMs, enabledTools };
  if (Buffer.byteLength(JSON.stringify(result)) > 65536) throw new Error("MCP 配置过大");
  return result;
}

module.exports = {
  record,
  resources,
  deployedSkills,
  deployment,
  mcpServers,
  pluginConnections,
  availableSkills,
  normalizeMcp,
};
