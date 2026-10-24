import { ActivityGroup, Disclosure, ImageDisclosure, TaskContext } from "@areal/ui/wip";
import { useLayoutEffect, useRef, useState } from "react";
import { FileTextIcon, GlobeIcon, ImageIcon } from "lucide-react";
import "@areal/ui/conversation.css";
import { ActivityIcon } from "../ActivityIcon.js";
import { AgentAvatar } from "../AgentIdentity.js";
import { ToolEvent } from "../ToolEvent.js";
import { SentAttachment } from "../MessageAttachment.js";
import { ConversationComposer } from "../ConversationComposer.js";
import { WorkbenchShell } from "../app-shell/WorkbenchShell.js";
import { ReviewPanelIcon } from "../app-shell/panelIcons.js";
import { Button } from "../components/ui/button.js";
import { Feedback } from "../components/ui/feedback.js";
import { SettingsSegmentedTabs } from "../settings/SettingsSegmentedTabs.js";
import { editedActivity, editReview, previewMedia, previewProject, previewSources, readActivity, systemActivities, verificationActivity, type PreviewSource, type SystemPhase } from "./conversationSystemScenario.js";
import "./conversation-system.css";

function SourceIcon({ kind }: { kind: PreviewSource["kind"] }) {
  return kind === "image" ? <ImageIcon size={16} /> : kind === "web" ? <GlobeIcon size={16} /> : <FileTextIcon size={16} />;
}

type Inspection = { kind: "sources" } | { kind: "add" } | { kind: "changes" } | { kind: "unknown" }
  | { kind: "source"; source: PreviewSource } | { kind: "file"; path: string } | { kind: "agent"; id: string; name: string };

const phaseItems = [
  { value: "running" as const, label: "运行中" }, { value: "completed" as const, label: "已完成" }, { value: "attention" as const, label: "需要关注" },
];

export function ConversationSystemPreview({ dark }: { dark: boolean }) {
  const [phase, setPhase] = useState<SystemPhase>("running");
  const [revision, setRevision] = useState(0);
  const [sourceCount, setSourceCount] = useState("5");
  const [draftSource, setDraftSource] = useState(false);
  const [imageAvailable, setImageAvailable] = useState(true);
  const [draft, setDraft] = useState("");
  const [contextOpen, setContextOpen] = useState(false);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const contextTrigger = useRef<HTMLButtonElement>(null);
  const contextHeading = useRef<HTMLHeadingElement>(null);
  const invoker = useRef<HTMLElement | null>(null);
  const sources: PreviewSource[] = [...previewSources.slice(0, Number(sourceCount)), ...(draftSource
    ? [{ id: "draft-web", kind: "web" as const, name: "新加入的网页引用", location: "example.com/draft", note: "草稿待发送" }] : [])];
  const activities = systemActivities(phase, revision);
  const childState = phase === "running" ? "运行中" : phase === "attention" ? "需要确认" : "已完成";
  const inspect = (next: Inspection) => {
    invoker.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setInspection(next);
    // In wide layout the context is already visible. Only narrow inspection
    // changes which region is shown; don't carry a wide inspection into resize.
    if (contextTrigger.current && getComputedStyle(contextTrigger.current).display !== "none") setContextOpen(true);
  };
  const returnContext = () => {
    setInspection(null);
    requestAnimationFrame(() => (invoker.current?.isConnected ? invoker.current : contextHeading.current)?.focus({ preventScroll: true }));
  };
  const returnConversation = () => {
    setInspection(null); setContextOpen(false);
    requestAnimationFrame(() => contextTrigger.current?.focus({ preventScroll: true }));
  };
  useLayoutEffect(() => {
    if (inspection || contextOpen) contextHeading.current?.focus({ preventScroll: true });
  }, [inspection, contextOpen]);
  const sourceRow = (source: PreviewSource) => <TaskContext.Item key={source.id} title={source.name} description={source.note ?? source.location}
    icon={<SourceIcon kind={source.kind} />} aria-label={`查看来源：${source.name}`} onClick={() => inspect({ kind: "source", source })} />;
  const inspectionTitle = !inspection ? "任务上下文" : inspection.kind === "sources" ? "全部来源" : inspection.kind === "add" ? "添加输入来源"
    : inspection.kind === "changes" ? "未暂存变更" : inspection.kind === "unknown" ? "结果待核对" : inspection.kind === "source" ? inspection.source.name
      : inspection.kind === "agent" ? inspection.name : inspection.path.split("/").at(-1)!;

  return <section className="conversation-system" aria-label="对话流设计预览" data-theme={dark ? "dark" : "light"}>
    <div className="cs-preview-bar">
      <div><h2>对话流 · 活动与上下文</h2><p>本地交互样例 · 所有执行与资源均为示例数据</p></div>
      <SettingsSegmentedTabs ariaLabel="任务状态" value={phase} onValueChange={setPhase} items={phaseItems} />
      <label>来源数量<select aria-label="来源数量" value={sourceCount} onChange={event => { setSourceCount(event.target.value); setDraftSource(false); }}>
        <option value="0">0 项 · 空态</option><option value="3">3 项</option><option value="5">5 项 · 含不可用引用</option>
      </select></label>
      <label>图片状态<select aria-label="图片状态" value={imageAvailable ? "available" : "unavailable"} onChange={event => setImageAvailable(event.target.value === "available")}>
        <option value="available">可用</option><option value="unavailable">引用不可用</option>
      </select></label>
      <Button variant="outline" size="sm" onClick={() => setRevision(value => value + 1)} disabled={phase !== "running"}>追加命令输出</Button>
      <a href="?docs=clients/gui/design-system/conversation-flow.md">阅读规范</a>
    </div>
    <WorkbenchShell className="conversation-system-shell" data-context-open={contextOpen}>
      <div className="cs-conversation">
        <header className="cs-chat-header"><span>整理对话流设计系统</span><Button ref={contextTrigger} variant="ghost" size="sm" className="cs-context-toggle"
          aria-label="查看任务上下文" aria-expanded={contextOpen} onClick={() => setContextOpen(true)}>任务上下文</Button></header>
        <div className="cs-transcript" role="region" aria-label="示例对话" tabIndex={0}>
          <div className="cs-reading-column">
            <p className="cs-user-message">把活动分组、图片和任务上下文整理为统一的对话流，保留按需展开与返回阅读。</p>
            <p>我会先读取现有规范与组件，再整理活动的展示层级。命令、图片与子任务分别保留自己的入口。</p>
            <ActivityGroup indicator={<ActivityIcon kind="chevron" size={14} />} label="读取文件、运行命令 · 30 项活动" icon={<ActivityIcon kind="command" />}
              status={phase === "attention" ? <div className="cs-attention"><Feedback message="结果待核对 · 连接中断，命令是否退出尚未确认。" />
                <Button variant="outline" size="sm" onClick={() => inspect({ kind: "unknown" })}>查看待核对记录</Button></div>
                : <p role="status">{phase === "running" ? `正在检查组件 · 已收集 ${5 + revision * 3} 段输出` : "命令已退出 · 退出码 0"}</p>}>
                {activities.map(item => <ToolEvent key={item.id} item={item} projectId={previewProject.id} threadId="system-main"
                  onFile={path => inspect({ kind: "file", path })} />)}
            </ActivityGroup>
            <ImageDisclosure indicator={<ActivityIcon kind="chevron" size={14} />} label="已查看图片 · 界面参考.png"
              {...(imageAvailable ? { state: "available", children: <SentAttachment part={{ type: "image", uri: "areal://blob/system-image", name: "界面参考.png" }}
                projectId={previewProject.id} threadId="system-main" action={previewMedia} /> } : { state: "unavailable", message: "图片引用暂不可用；保留原活动记录。" })} />
            <ToolEvent item={readActivity} onFile={path => inspect({ kind: "file", path })} />
            <Button variant="ghost" className="cs-agent-activity" onClick={() => inspect({ kind: "agent", id: "layout", name: "对话布局检查" })}>
              <AgentAvatar id="layout" size={16} /><span>对话布局检查</span><small>{childState}</small><span className="cs-row-action">查看</span>
            </Button>
            <ActivityGroup indicator={<ActivityIcon kind="chevron" size={14} />} label="已编辑文件、运行命令" icon={<ActivityIcon kind="edit" />}>
              <ToolEvent item={editedActivity} turnId="system-turn" readTurnReview={editReview} onFile={path => inspect({ kind: "file", path })} />
              <ToolEvent item={verificationActivity} />
              <p className="cs-detail-note">本次示例修改一行默认值；文件差异与命令输出分别查看。</p>
            </ActivityGroup>
            <p>活动摘要用于快速了解过程，展开后可以核对原始记录。右侧按项目、子任务和输入来源整理相关对象。</p>
            {phase === "completed" && <div className="cs-final"><h3>对话流预览已整理完成</h3><p>活动与图片可按需展开，来源支持三项预览和查看全部。可以继续切换主题、字号和窄窗，检查同一组内容的呈现。</p></div>}
            {phase === "attention" && <p>已保留当前记录。查看详情不会重新执行命令；子任务的状态需要分别确认。</p>}
          </div>
        </div>
        <div className="cs-composer composer-dock"><ConversationComposer project={previewProject} modelConfig={previewProject.configurations.main}
          modelDisabled onConfigureModel={() => {}} initialValue={draft} inputTestId="system-preview-composer" workspacePath={previewProject.root}
          taskId="system-main" placeholder="补充这项任务…" submitDisabled submitLabel="发送" onChange={setDraft} onSubmit={() => false}
          enableMentionPanel={false} /></div>
      </div>
      <TaskContext title={inspectionTitle} headingRef={contextHeading} onBack={inspection ? returnContext : undefined}
        actions={<Button variant="ghost" size="sm" className="cs-context-toggle" onClick={returnConversation}>返回对话</Button>}>
          <div hidden={!!inspection}>
            <TaskContext.Section label="当前项目变更" title="AReaL-Harness">
              <TaskContext.Item title="Changes" description="未暂存 · 2 个文件" icon={<ReviewPanelIcon />} onClick={() => inspect({ kind: "changes" })}
                meta={<span className="diff-count"><b>+24</b><em>−8</em></span>} />
            </TaskContext.Section>
            <TaskContext.Section label="关联项目">
              {["ZCode", "Classic-skills", "magpie"].map(name => <Disclosure indicator={<ActivityIcon kind="chevron" size={14} />} key={name} label={`展开关联项目 ${name}`} displayLabel={name} textRole="interface" className="cs-project" icon={<ActivityIcon kind="list" />}>
                <p className="cs-detail-note">同一工作上下文的关联项目</p><p className="cs-path">/preview/workspace/{name}</p>
                <Button variant="ghost" size="sm" onClick={() => inspect({ kind: "file", path: `${name}/README.md` })}>查看项目说明</Button>
              </Disclosure>)}
            </TaskContext.Section>
            <TaskContext.Section label="子代理列表">
              <Disclosure indicator={<ActivityIcon kind="chevron" size={14} />} label="Subagents · 3 个子任务" textRole="interface">
                {[{ id: "layout", name: "对话布局检查", status: childState }, { id: "contract", name: "活动合同核对", status: "已完成" }, { id: "review", name: "资源归属检查", status: "已完成" }].map(agent => <TaskContext.Item key={agent.id} title={agent.name} description={agent.status}
                  icon={<AgentAvatar id={agent.id} size={18} />} onClick={() => inspect({ kind: "agent", ...agent })} />)}
              </Disclosure>
              <div className="cs-agent-summary"><AgentAvatar id="layout" size={18} /><AgentAvatar id="contract" size={18} /><AgentAvatar id="review" size={18} /><span>{phase === "completed" ? "3 个已完成" : phase === "attention" ? "1 个待确认 · 2 个已完成" : "1 个运行中 · 2 个已完成"}</span></div>
            </TaskContext.Section>
            <TaskContext.Sources items={sources} onViewAll={() => inspect({ kind: "sources" })} onAdd={() => inspect({ kind: "add" })}>{sourceRow}</TaskContext.Sources>
          </div>
          {inspection?.kind === "sources" && <section aria-label="全部来源"><p className="cs-detail-note">{sources.length} 项输入来源</p>{sources.map(sourceRow)}</section>}
          {inspection?.kind === "add" && <section aria-label="添加输入来源"><p>将参考资料加入未发送的草稿。</p><Button variant="outline" onClick={() => { setDraftSource(true); setInspection(null); }}>添加示例网页到草稿</Button></section>}
          {inspection?.kind === "source" && <section><p className="cs-path">{inspection.source.location}</p>{inspection.source.note && <Feedback message={inspection.source.note} />}
            {inspection.source.kind === "image" ? <SentAttachment part={{ type: "image", uri: "areal://blob/system-image", name: inspection.source.name }} projectId={previewProject.id} threadId="system-main" action={previewMedia} />
              : <p>{inspection.source.id === "raft" ? "参考其基础规则、通用控件、领域组合与产品布局的职责划分。此处展示本地引用摘要。" : "这是设计预览中的引用记录；来源身份与名称在返回后保留。"}</p>}</section>}
          {inspection?.kind === "agent" && <section><div className="cs-agent-summary"><AgentAvatar id={inspection.id} size={24} /><span>{inspection.id === "layout" ? childState : "已完成"}</span></div><p>核对活动分组、阅读返回和资源归属，保留独立的子任务状态。</p><p className="cs-detail-note">子任务示例 · 父任务状态独立显示</p></section>}
          {inspection?.kind === "file" && <section><p className="cs-path">{inspection.path}</p><pre className="cs-file-content">{`# 对话流设计\n\n活动按原始顺序组织。\n展开用于核对内容，返回后继续原来的阅读。`}</pre></section>}
          {inspection?.kind === "changes" && <section><p>当前项目 · 未暂存变更</p><p className="cs-detail-note">示例统计包含工作区变更，不将全部修改归为 Agent 产出。</p><pre className="cs-file-content">{`src/conversation/ActivityGroup.tsx  +16 −4\nsrc/conversation/Context.tsx         +8 −4`}</pre></section>}
          {inspection?.kind === "unknown" && <section><Feedback message="退出结果尚未确认；保留原命令记录。" /><p>processId: preview-process</p><p>最后一次观察：已收到部分输出，连接随后中断。</p><p className="cs-detail-note">这里只展示已收集记录，不执行重试或重新运行命令。</p></section>}
      </TaskContext>
    </WorkbenchShell>
  </section>;
}
