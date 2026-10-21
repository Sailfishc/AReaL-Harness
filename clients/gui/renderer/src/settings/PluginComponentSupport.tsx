export type ComponentSupport = {
  kind: string;
  sourceField: string;
  status: "supported" | "partial" | "unsupported";
  reasonCodes: string[];
  supportedSchema: string | null;
  required: boolean;
  activationRequirements: string[];
};
export type PackageComponentSupport = {
  digest: string;
  manifestFormat: string;
  components: ComponentSupport[];
  compatibility: { state: "allowed" | "blocked"; reasonCodes: string[] };
  validation: { scope: string; provider: string; platform: string; distribution: string };
};
const kinds: Record<string, string> = {
  skills: "Skills", mcp: "MCP", hooks: "Hooks", apps: "Connector", commands: "Commands", agents: "Agents", uiSurfaces: "UI 页面",
};
const statuses = { supported: "解析契约支持", partial: "部分支持", unsupported: "尚不支持" };
const reasons: Record<string, string> = {
  componentNotImplemented: "此类声明尚未实现。",
  invalidMcpEnvelope: "MCP 声明结构无效。",
  emptyMcpEnvelope: "MCP 声明未包含服务。",
  invalidHookEnvelope: "Hook 声明结构无效。",
  emptyHookEnvelope: "Hook 声明未包含处理器。",
  unsupportedHookEnvelope: "Hook 事件或处理器尚不支持。",
  invalidConnectorEnvelope: "Connector 声明结构无效。",
  emptyConnectorEnvelope: "Connector 声明为空。",
  componentDocumentMissingOrInvalid: "组件文件缺失或格式无效。",
  emptyComponentDeclaration: "组件声明为空。",
};
const requirements: Record<string, string> = {
  installed: "安装当前快照", enabled: "当前项目启用", profileAllowsPluginSkills: "目标会话 Profile 允许插件",
  explicitMcpTrust: "单独信任 MCP", mcpConnection: "连接 MCP 服务", authentication: "完成认证",
  authenticationWhenDeclared: "按服务声明完成认证", connectorMapping: "配置 Connector 映射",
  explicitHookDefinitionTrust: "单独信任 Hook 定义", readOnlyHookConsentWhenApplicable: "只读子会话另需命令 Hook 授权",
};
function reasonText(reason: string) {
  const [code, kind] = reason.split(":");
  if (code === "requiredKindMissing") return `缺少必需的 ${kinds[kind] ?? kind} 声明。`;
  if (code === "requiredKindUnsupported") return `必需的 ${kinds[kind] ?? kind} 声明未完全受支持。`;
  return reasons[reason] ?? reason;
}
export function supportBlocked(report: PackageComponentSupport | null | undefined, digest: string | null) {
  return !!report && report.digest === digest && report.compatibility.state === "blocked";
}
export function PluginComponentSupport({ report, digest, installed }: {
  report?: PackageComponentSupport | null;
  digest: string | null;
  installed: boolean;
}) {
  const title = installed ? "已安装组件支持" : "目录组件支持";
  if (!report || report.digest !== digest) return <section className="plugin-detail-resources" aria-label={title}><h3>{title}</h3><p>当前快照的支持报告尚未核实。</p></section>;
  const partial = report.components.some(row => row.status !== "supported");
  return <section className="plugin-detail-resources" aria-label={title}>
    <h3>{title}</h3>
    <p>{report.compatibility.state === "blocked" ? "必需组件不兼容，当前快照不可激活。" : partial ? "部分组件不受支持" : "已声明组件符合所列解析契约。"}</p>
    {report.compatibility.reasonCodes.length > 0 && <ul>{report.compatibility.reasonCodes.map(reason => <li key={reason}>{reasonText(reason)}</li>)}</ul>}
    <p>当前会话的 Profile 决定实际准入。</p>
    <p>MCP 连接、认证与 Hook 信任以各自状态为准。真实供应商、其他平台和发行包验证尚未核实。</p>
    <details><summary>查看逐项声明与前提</summary>
      <p>快照 <code>{report.digest}</code></p>
      {!report.components.length && <p>此快照未声明组件。</p>}
      <ul>{report.components.map((row, index) => <li key={`${row.sourceField}:${index}`}>
        <strong>{kinds[row.kind] ?? row.kind} · {statuses[row.status]}{row.required ? " · 必需" : ""}</strong>
        <p><code>{row.sourceField}</code></p>
        {row.reasonCodes.map(reason => <p key={reason}>{reasonText(reason)}</p>)}
        {row.supportedSchema && <p>解析契约 <code>{row.supportedSchema}</code></p>}
        {!!row.activationRequirements.length && <p>使用前提为{row.activationRequirements.map(value => requirements[value] ?? value).join("、")}。</p>}
      </li>)}</ul>
    </details>
  </section>;
}
