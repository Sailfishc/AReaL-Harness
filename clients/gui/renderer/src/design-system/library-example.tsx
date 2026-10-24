import { createRoot } from "react-dom/client";
import { useState } from "react";
import { Button } from "@areal/ui";
import { Disclosure } from "@areal/ui/wip";
import "./library-example.css";

const query = new URLSearchParams(location.search);
document.documentElement.classList.toggle("dark", query.get("theme") === "dark");
document.documentElement.style.setProperty("--ui-font-size", query.get("font") === "18" ? "18px" : "14px");

function Example() {
  const [count, setCount] = useState(0);
  return <main className="library-example"><h1>包内组件独立示例</h1><p>直接消费 @areal/ui 的导出与样式，未加载 renderer 的 styles.css、workbench.css 或应用偏好代码。</p>
    <div className="library-example-actions"><Button onClick={() => setCount(value => value + 1)}>执行示例</Button><Button variant="outline">普通操作</Button><Button variant="ghost">辅助操作</Button><Button variant="warning">中断操作</Button><Button disabled>不可用</Button></div>
    <p className="library-example-result" role="status">已触发 {count} 次本地动作</p>
    <Disclosure label="查看组件职责" textRole="interface"><p>基础交互与外观由包内实现负责。业务状态、执行与持久化由宿主提供。</p></Disclosure>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Example />);
