import { createRoot } from "react-dom/client";
import { useState } from "react";
import { Button } from "@areal/ui";
import { ActivityGroup, Disclosure, ImageDisclosure, TaskContext } from "@areal/ui/wip";
import sampleImage from "../../../../../docs/assets/tui.png";
import "./library-example.css";

const query = new URLSearchParams(location.search);
document.documentElement.classList.toggle("dark", query.get("theme") === "dark");
document.documentElement.style.setProperty("--ui-font-size", query.get("font") === "18" ? "18px" : "14px");

function Example() {
  const [count, setCount] = useState(0);
  const [attention, setAttention] = useState(false);
  const [imageAvailable, setImageAvailable] = useState(true);
  const [inspection, setInspection] = useState<string | null>(null);
  const [draftAdded, setDraftAdded] = useState(false);
  const items = Array.from({ length: draftAdded ? 6 : 5 }, (_, index) => ({ id: `source-${index}`, name: ["本地图片", "参考网页", "设计规范", "交互标注", "不可用历史引用", "草稿网页"][index] }));
  const source = (item: typeof items[number]) => <TaskContext.Item key={item.id} title={item.name} description={item.id === "source-4" ? "原引用暂不可用" : "本地示例输入"}
    aria-label={`查看来源：${item.name}`} onClick={() => setInspection(item.id)} />;
  return <main className="library-example"><h1>包内组件独立示例</h1><p>直接消费 @areal/ui 的导出与样式，未加载 renderer 的 styles.css、workbench.css 或应用偏好代码。</p>
    <div className="library-example-actions"><Button onClick={() => setCount(value => value + 1)}>执行示例</Button><Button variant="outline">普通操作</Button><Button variant="ghost">辅助操作</Button><Button variant="warning">中断操作</Button><Button disabled>不可用</Button></div>
    <p className="library-example-result" role="status">已触发 {count} 次本地动作</p>
    <Disclosure label="查看组件职责" textRole="interface"><p>基础交互与外观由包内实现负责。业务状态、执行与持久化由宿主提供。</p></Disclosure>
    <section className="library-conversation" aria-label="独立对话组件">
      <div><h2>对话活动</h2><p>示例状态由本页提供，组件不连接执行服务。</p>
        <div className="library-example-actions"><Button variant="outline" onClick={() => setAttention(value => !value)}>显示待核对状态</Button><Button variant="outline" onClick={() => setImageAvailable(value => !value)}>切换图片可用性</Button></div>
        <ActivityGroup label="读取文件、运行命令 · 30 项活动" status={<p role="status">{attention ? "退出结果待核对；查看不会重试" : "正在收集示例输出"}</p>}>
          <ol className="library-activities">{Array.from({ length: 30 }, (_, index) => <li key={index}>{index === 0 ? <Disclosure label="查看首条命令"><pre>{`pnpm typecheck ${"long_argument_".repeat(40)}\n原始命令完整换行，不横向滚动。`}</pre></Disclosure> : `读取记录 ${index + 1} /workspace/${"reference_".repeat(12)}.md`}</li>)}</ol>
        </ActivityGroup>
        <ImageDisclosure label="已查看图片 · 本地示例" {...(imageAvailable ? { state: "available", children: <img src={sampleImage} alt="本地界面参考" /> }
          : { state: "unavailable", message: "图片暂不可用；原引用仍然保留。" })} />
      </div>
      <TaskContext title={inspection === "sources" ? "全部来源" : inspection === "changes" ? "未暂存变更" : items.find(item => item.id === inspection)?.name ?? "任务上下文"} onBack={inspection ? () => setInspection(null) : undefined}>
        <div hidden={!!inspection}>
          <TaskContext.Section label="当前项目变更" title="示例项目"><TaskContext.Item title="Changes" description="未暂存 · 2 个文件" meta="+24 −8" onClick={() => setInspection("changes")} /></TaskContext.Section>
          <TaskContext.Sources items={items} onViewAll={() => setInspection("sources")} onAdd={() => setDraftAdded(true)}>{source}</TaskContext.Sources>
        </div>
        {inspection === "sources" && items.map(source)}
        {inspection === "changes" && <p>示例工作区的两个文件有未暂存修改；此处只查看记录。</p>}
        {inspection?.startsWith("source-") && <p>本地示例引用：{items.find(item => item.id === inspection)?.name}。{inspection === "source-4" ? "该历史引用暂不可用。" : "返回后保留原来源集合。"}</p>}
        {draftAdded && <p role="status">已加入草稿</p>}
      </TaskContext>
    </section>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Example />);
