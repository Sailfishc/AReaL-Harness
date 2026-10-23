import { useLayoutEffect, useState } from "react";
import { Button } from "../components/ui/button.js";
import { useAppearance } from "../settings/applicationPreferences.js";
import { baseCandidate } from "./catalog.js";
import "./design-dashboard.css";

type PhaseId = "architecture" | "base" | "independent" | "feedback";
type PhaseStatus = "established" | "completed" | "current" | "pending" | "later";
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
  established: "已建立", completed: "本轮已完成", current: "当前阶段", pending: "待开始", later: "后续迭代",
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
    id: "base", letter: "B", title: "Base 设计系统", status: "completed",
    summary: "三条真实 GUI 路径收敛，有限 Base 已冻结为独立复用的固定输入。",
    outcomes: ["提交、过程、审批到结果复用生产组件与原执行控制器。", "外观修改立即生效；资源文件与 Diff 关闭后返回原任务，保留草稿、阅读和焦点。", "有限成员具有就近合同、来源、变体、状态与证据，目录生成入口并检查漂移。"],
    remaining: ["冻结仅限 Base 列明范围，不表示稳定公共 API。", "P-RESOURCES、完整对话与 SidePane 等继续按真实需求单独准入。"],
    sources: [{ title: "Base 与兼容边界", path: "clients/gui/design-system/base.md" }, { title: "运行证据", path: "clients/gui/design-system/base-evidence.md" }, { title: "深入查看与返回", path: "design/patterns/inspect-and-return.md" }],
  },
  {
    id: "independent", letter: "C", title: "固定题目与模拟页面", status: "completed",
    summary: "冻结输入上的交付物核对题已完成，复用已有组件和 Token，没有增加页面 CSS。",
    outcomes: ["题目与可访问语义先固定，实现者与评估材料分离。", "筛选、处理中换对象、失败、未知结果显式核对、刷新与键盘通过本地检查。"],
    remaining: ["单个独立任务不证明所有组件、主题或平台的泛化。", "本地模拟不连接 Core、文件系统或供应商。"],
    sources: [{ title: "固定题目", path: "design/components/reuse-exercise.md" }, { title: "独立复用结果", path: "design/components/reuse-result.md" }],
  },
  {
    id: "feedback", letter: "D", title: "归因并改进", status: "completed",
    summary: "本轮未确认共享规则或实现缺陷；修正评估器后复验，并保留另一条真实 GUI 任务检查。",
    outcomes: ["评估器的定位、按钮内容假设和时钟问题归回评估器，消费者与冻结 Base 保持不变。", "资源返回保留场景复验通过，未因新增题目提升 Base 版本。"],
    remaining: ["用户仍拥有整体产品与视觉结果的最终评价权。", "下一轮从真实 GUI 的资源管理或异常恢复需求扩大有限准入。"],
    sources: [{ title: "结果与归因", path: "design/components/reuse-result.md" }, { title: "建设计划", path: "design/roadmap.md" }],
  },
];
const slices = [
  { title: "完成一项任务", path: "提交 → 过程 → 审批 → 结果", result: "真实批准、拒绝与文件结果已核对。执行事实继续由 Core 与 Runtime 提供。", feedback: true, source: "design/products/workbench/README.md" },
  { title: "修改外观后继续工作", path: "外观设置 → 立即生效 → 返回原任务", result: "真实设置偏好已核对。返回时保留草稿与当前可用的阅读段落。", feedback: true, source: "design/patterns/settings.md" },
  { title: "查看资源后回到任务", path: "结果 → 文件 / Diff → 返回原任务", result: "真实文件回执、历史轮次 Diff、缺失文件恢复与返回焦点已核对。保留草稿和当前阅读。", feedback: false, source: "design/patterns/inspect-and-return.md" },
] as const;

function documentUrl(path: string) {
  const [file, fragment] = path.split("#");
  return `?docs=${encodeURIComponent(file)}${fragment ? `#${encodeURIComponent(fragment)}` : ""}`;
}

export function DesignDashboard() {
  const [dark, setDark] = useState(false);
  const [phaseId, setPhaseId] = useState<PhaseId>("feedback");
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
          <a href="?reuse-exercise">操作独立复用题</a>
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
          <p className="design-dashboard-eyebrow">当前 · 最小闭环已完成</p>
          <h2 id="dashboard-current-title">有限 Base beta</h2>
          <p className="design-dashboard-base">Base {baseCandidate.version}<span>{baseCandidate.status === "frozen-beta" ? "有限范围已冻结" : "候选未冻结"}</span></p>
          <p>任务、外观、资源三个切片有真实 GUI 证据，冻结输入上的独立复用题已通过。<strong>首轮反馈未发现明显问题，与现有基准接近。</strong></p>
          <div className="design-dashboard-next">
            <h3>下一步</h3>
            <p>先操作交付物核对题并评价整体效果。下一轮按真实 GUI 的资源管理或异常恢复需求扩大准入。</p>
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
              <div><h4>{phase.status === "current" || phase.status === "established" || phase.status === "completed" ? "已有基础" : "预期产物"}</h4><ul>{phase.outcomes.map(item => <li key={item}>{item}</li>)}</ul></div>
              <div><h4>{phase.status === "completed" ? "后续边界" : phase.status === "established" ? "仍需保持" : "尚需完成"}</h4><ul>{phase.remaining.map(item => <li key={item}>{item}</li>)}</ul></div>
            </div>
            <nav className="design-dashboard-source-links" aria-label={`${phase.title}来源`}>{phase.sources.map(source => <a key={source.path} href={documentUrl(source.path)}>{source.title} ↗</a>)}</nav>
          </section>
        </div>
      </section>

      <section className="design-dashboard-slices" aria-labelledby="dashboard-slices-title">
        <div className="design-dashboard-section-heading"><h2 id="dashboard-slices-title">当前已走通的三个切片</h2><p>实现、运行验证与人的评价分别记录。</p></div>
        {slices.map(slice => <article key={slice.title} className="design-dashboard-slice">
          <div><h3>{slice.title}</h3><p className="design-dashboard-slice-path">{slice.path}</p></div>
          <div><div className="design-dashboard-evidence"><span>已实现</span><span>自动化 GUI 已验证</span><span>{slice.feedback ? "用户首轮反馈已记录" : "等待用户体验评价"}</span></div><p>{slice.result}</p></div>
          <a href={documentUrl(slice.source)}>阅读来源 ↗</a>
        </article>)}
        <details className="design-dashboard-limits">
          <summary>验证范围与已知缺口</summary>
          <div className="design-dashboard-limits-content">
            <p>三个切片的路径证据来自隔离的 Electron、Core 与 Runtime，模型事件由本地确定性服务提供。它们不证明真实供应商、安装包、其他平台或全部主题与状态矩阵已经通过。</p>
            <p>外观返回只验证同一进程中当前可用的阅读段落。完整历史未重新加载时，不能推断尚未取得的内容也能恢复。</p>
            <p>图片题对旧入口的假设和过程展开位置回归均已修复并复验。独立复用限一个固定任务，未扩大为完整组件或平台验收。</p>
            <p>首轮用户反馈仅对应已体验范围，不等于所有主题、字号与状态均获认可。组件目录和构建通过，不能代替用户路径、原生平台或安装包验收。</p>
            <p className="design-dashboard-technical">本快照的固定输入为 c98af14e；具体来源与运行见 Base 证据和独立结果。Base 标识读取现有目录 {baseCandidate.id}。<a href={documentUrl("design/architecture.md#验证边界")}>查看验证边界</a></p>
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
