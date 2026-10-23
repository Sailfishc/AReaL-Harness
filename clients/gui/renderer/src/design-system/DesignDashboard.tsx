import { useLayoutEffect, useState } from "react";
import { Button } from "../components/ui/button.js";
import { useAppearance } from "../settings/applicationPreferences.js";
import { baseCandidate } from "./catalog.js";
import "./design-dashboard.css";

type PhaseId = "architecture" | "base" | "independent" | "feedback";
type PhaseStatus = "established" | "current" | "pending" | "later";
type Source = { readonly title: string; readonly path: string };
type Phase = {
  readonly id: PhaseId;
  readonly letter: string;
  readonly title: string;
  readonly status: PhaseStatus;
  readonly summary: string;
  readonly outcomes: readonly string[];
  readonly remaining: readonly string[];
  readonly sources: readonly Source[];
};

const statusLabels: Record<PhaseStatus, string> = {
  established: "已建立", current: "当前阶段", pending: "待开始", later: "后续迭代",
};
const phases: readonly Phase[] = [
  {
    id: "architecture", letter: "A", title: "架构", status: "established",
    summary: "设计知识、生产实现和验证各有所有者。设计地图已经建立，视觉选择仍需在真实任务中评价。",
    outcomes: ["原则、基础、内容、交互与工作台说明已有统一入口。", "组件、Token 和执行权威沿用原有生产所有者。"],
    remaining: ["设计地图建立不等于所有设计已经批准。后续取舍继续回到对应主题维护。"],
    sources: [{ title: "设计地图", path: "design/README.md" }, { title: "设计系统架构", path: "design/architecture.md" }],
  },
  {
    id: "base", letter: "B", title: "Base 设计系统", status: "current",
    summary: "正在收敛真实 GUI 路径。先评价任务与外观两个切片，再补资源查看与返回，形成最小完整 Base。",
    outcomes: ["提交、过程、审批到结果已接入生产组件与原执行控制器。", "修改外观后立即生效，返回同一任务时保留草稿与当前可用的阅读段落。"],
    remaining: ["完成用户视觉评价，收敛两个切片的文字层级、密度与状态表达。", "补文件与 Diff 的查看、关闭及返回路径，核对归属、草稿、阅读和焦点。", "核对最小角色与组件的来源、状态合同和证据，处理图片 fixture 回归后再判断相关 Base 稳定性。"],
    sources: [{ title: "建设计划", path: "design/roadmap.md" }, { title: "Base 候选与准入", path: "clients/gui/design-system/base.md" }, { title: "深入查看与返回", path: "design/patterns/inspect-and-return.md" }],
  },
  {
    id: "independent", letter: "C", title: "固定题目与模拟页面", status: "pending",
    summary: "在有限 Base 冻结后，用另一种独立任务检验能否复用同样的设计选择。现有探索题不等于正式独立验证。",
    outcomes: ["题目、内容、状态和评判条件先固定。", "新页面复用已有组件与模式，不增加一套页面专用规则。"],
    remaining: ["先完成 B 阶段的有限准入与输入冻结。", "分开实现输入与评判材料，独立检验规则是否足够。"],
    sources: [{ title: "阶段与准入", path: "clients/gui/design-system/architecture.md#阶段及准入" }, { title: "Base 当前边界", path: "clients/gui/design-system/base.md" }],
  },
  {
    id: "feedback", letter: "D", title: "归因并改进", status: "later",
    summary: "依据独立任务的偏差修订共享所有者，再复跑原题与另一种真实任务。",
    outcomes: ["区分规则缺失、规则含糊、组件缺陷、采用偏差和题目歧义。", "修订后留下可重复核对的结果，避免只适合一个页面。"],
    remaining: ["取得 C 阶段的独立结果后再归因。", "按结果修订有限 Base，保留版本、兼容边界和未覆盖项。"],
    sources: [{ title: "阶段与准入", path: "clients/gui/design-system/architecture.md#阶段及准入" }],
  },
];
const slices = [
  { title: "完成一项任务", path: "提交 → 过程 → 审批 → 结果", result: "真实批准、拒绝与文件结果已核对。执行事实继续由 Core 与 Runtime 提供。", source: "design/products/workbench/README.md" },
  { title: "修改外观后继续工作", path: "外观设置 → 立即生效 → 返回原任务", result: "真实设置偏好已核对。返回时保留草稿与当前可用的阅读段落。", source: "design/patterns/settings.md" },
] as const;

function documentUrl(path: string) {
  const [file, fragment] = path.split("#");
  return `?docs=${encodeURIComponent(file)}${fragment ? `#${encodeURIComponent(fragment)}` : ""}`;
}

export function DesignDashboard() {
  const [dark, setDark] = useState(false);
  const [phaseId, setPhaseId] = useState<PhaseId>("base");
  const phase = phases.find(item => item.id === phaseId)!;
  useAppearance(dark);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", dark);
    root.classList.toggle("theme-areal-light", !dark);
    root.classList.toggle("theme-areal-dark", dark);
    root.style.colorScheme = dark ? "dark" : "light";
  }, [dark]);

  return <main className="design-dashboard">
    <div className="design-dashboard-layout">
      <header className="design-dashboard-header">
        <a className="design-dashboard-brand" href="?dashboard" aria-current="page">AReaL / 设计系统</a>
        <nav aria-label="设计预览导航">
          <a href={documentUrl("design/README.md")}>设计地图</a>
          <a href={`${window.location.pathname}#controls`}>组件示例</a>
          <a href="?product-candidate">完整产品候选</a>
        </nav>
        <Button variant="outline" size="sm" aria-pressed={dark} onClick={() => setDark(value => !value)}>深色主题</Button>
      </header>

      <div className="design-dashboard-heading">
        <div><p className="design-dashboard-eyebrow">目标 · 阶段 · 下一步</p><h1>设计系统建设看板</h1></div>
        <p className="design-dashboard-snapshot">手动整理的来源快照<br /><time dateTime="2026-10-23">2026 年 10 月 23 日</time><br />状态不随页面自动更新</p>
      </div>

      <section className="design-dashboard-overview" aria-label="目标与当前状态">
        <div className="design-dashboard-goal">
          <p className="design-dashboard-eyebrow">我们的终点</p>
          <h2>新增一个真实 GUI 任务，<br />仍能使用同一套设计选择。</h2>
          <p>原则、Token、组件与交互模式共同指导实现。每个选择都能找到来源、适用状态和验证证据，用户能连贯地完成工作。</p>
          <ul className="design-dashboard-acceptance">
            <li>提交、观察过程、处理决定、查看资源和返回工作形成完整体验。</li>
            <li>主题、字号、宽窄和键盘操作有对应证据，未覆盖的情况明确保留。</li>
            <li>新任务复用已有规则。需要修订时，回到同一个生产所有者。</li>
          </ul>
          <a href={documentUrl("design/roadmap.md#首轮完成条件")}>查看完整完成条件 →</a>
        </div>
        <aside className="design-dashboard-current" aria-labelledby="dashboard-current-title">
          <p className="design-dashboard-eyebrow">当前 · B 阶段</p>
          <h2 id="dashboard-current-title">真实 GUI 路径收敛</h2>
          <p className="design-dashboard-base">Base 候选 {baseCandidate.version}<span>未冻结</span></p>
          <p>任务与外观两个切片已有实现和自动化 GUI 路径证据。<strong>用户视觉验收待完成。</strong></p>
          <div className="design-dashboard-next">
            <h3>下一步</h3>
            <p>先收敛两个切片的视觉反馈，再补文件与 Diff 的查看和返回。随后收敛最小 Base，限定冻结范围，再做独立复用验证。</p>
          </div>
          <a href={documentUrl("design/roadmap.md")}>查看建设计划 →</a>
        </aside>
      </section>

      <section className="design-dashboard-phases" aria-labelledby="dashboard-phases-title">
        <div className="design-dashboard-section-heading"><h2 id="dashboard-phases-title">建设阶段</h2><p>选择阶段，查看产物与进入下一步的条件。</p></div>
        <div className="design-dashboard-phase-layout">
          <div className="design-dashboard-phase-list" role="group" aria-label="选择建设阶段">
            {phases.map(item => <Button key={item.id} variant="ghost" className="design-dashboard-phase" aria-pressed={phaseId === item.id} aria-controls="dashboard-phase-detail" onClick={() => setPhaseId(item.id)}>
              <span className="design-dashboard-phase-letter">{item.letter}</span>
              <span className="design-dashboard-phase-name">{item.title}<span>{statusLabels[item.status]}</span></span>
              <span aria-hidden="true">→</span>
            </Button>)}
          </div>
          <section id="dashboard-phase-detail" className="design-dashboard-phase-detail" aria-labelledby="dashboard-phase-title">
            <p className="design-dashboard-eyebrow">阶段 {phase.letter} · {statusLabels[phase.status]}</p>
            <h3 id="dashboard-phase-title">{phase.title}</h3>
            <p>{phase.summary}</p>
            <div className="design-dashboard-phase-criteria">
              <div><h4>{phase.status === "current" || phase.status === "established" ? "已有基础" : "预期产物"}</h4><ul>{phase.outcomes.map(item => <li key={item}>{item}</li>)}</ul></div>
              <div><h4>{phase.status === "established" ? "仍需保持" : "尚需完成"}</h4><ul>{phase.remaining.map(item => <li key={item}>{item}</li>)}</ul></div>
            </div>
            <nav className="design-dashboard-source-links" aria-label={`${phase.title}来源`}>{phase.sources.map(source => <a key={source.path} href={documentUrl(source.path)}>{source.title} ↗</a>)}</nav>
          </section>
        </div>
      </section>

      <section className="design-dashboard-slices" aria-labelledby="dashboard-slices-title">
        <div className="design-dashboard-section-heading"><h2 id="dashboard-slices-title">当前已走通的两个切片</h2><p>实现、运行验证与人的评价分别记录。</p></div>
        {slices.map(slice => <article key={slice.title} className="design-dashboard-slice">
          <div><h3>{slice.title}</h3><p className="design-dashboard-slice-path">{slice.path}</p></div>
          <div><div className="design-dashboard-evidence"><span>已实现</span><span>自动化 GUI 已验证</span><span>用户评价待完成</span></div><p>{slice.result}</p></div>
          <a href={documentUrl(slice.source)}>阅读来源 ↗</a>
        </article>)}
        <details className="design-dashboard-limits">
          <summary>验证范围与已知缺口</summary>
          <div className="design-dashboard-limits-content">
            <p>两个切片的路径证据来自隔离的 Electron、Core 与 Runtime，模型事件由本地确定性服务提供。它们不证明真实供应商、安装包、其他平台或全部主题与状态矩阵已经通过。</p>
            <p>外观返回只验证同一进程中当前可用的阅读段落。完整历史未重新加载时，不能推断尚未取得的内容也能恢复。</p>
            <p>图片 fixture 回归尚未定位完成。需先定位并复验，再判断相关 Base 能否稳定准入。已有探索题也不等于正式冻结后的独立盲测。</p>
            <p>用户尚未完成整体视觉验收。组件目录和构建通过，不能代替用户路径、原生平台或安装包验收。</p>
            <p className="design-dashboard-technical">本快照参考任务切片 ca349363 与外观切片 47d5d389。候选标识读取现有目录 {baseCandidate.id}。<a href={documentUrl("design/architecture.md#验证边界")}>查看验证边界</a></p>
          </div>
        </details>
      </section>

      <footer className="design-dashboard-footer">
        <p><strong>GUI 优先，Web 后续独立验证。</strong> Web 按实际接入复用适用的规则与组件，不阻塞本轮 GUI 完成。CLI 与 TUI 不在本设计系统建设范围内。</p>
        <a href={documentUrl("design/architecture.md")}>范围与所有者 ↗</a>
      </footer>
    </div>
  </main>;
}
