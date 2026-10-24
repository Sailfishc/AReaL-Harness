import assert from "node:assert/strict";
import { join } from "node:path";

export async function runUiLibrary(page, scratch, checks) {
  const library = page.getByRole("region", { name: "UI包设计系统", exact: true });
  await library.waitFor();
  const manifest = await page.evaluate(async () => (await fetch("/components.json")).json());
  assert.equal(manifest.name, "@areal/ui");
  assert.equal(manifest.private, true);
  assert.deepEqual(manifest.components.map(({ title, status, entry, layer }) => [title, status, entry, layer]), [
    ["ActivityGroup", "experimental", "wip", "conversation"], ["Button", "stable", "index", "core"],
    ["Disclosure", "experimental", "wip", "core"], ["ImageDisclosure", "experimental", "wip", "conversation"],
    ["TaskContext", "experimental", "wip", "conversation"],
  ]);
  assert.ok(manifest.components.find(component => component.title === "Button").api.includes("declare function Button"));
  for (const id of ["activity-group", "image-disclosure", "task-context"]) {
    const document = await page.evaluate(async id => (await fetch(`/docs/ui/${id}.md`)).text(), id);
    assert.ok(document.includes(`id: ${id}`), `raw contract for ${id}`);
    const component = manifest.components.find(component => component.id === id);
    await library.locator("article").filter({ has: page.getByRole("heading", { name: component.title, exact: true }) }).getByRole("link", { name: "阅读组件合同", exact: true }).click();
    await page.getByRole("heading", { name: new RegExp(`^${component.title} `) }).waitFor();
    await page.goBack(); await library.waitFor();
  }
  const llms = await page.evaluate(async () => (await fetch("/llms.txt")).text());
  assert.ok(llms.includes("@areal/ui/wip"));
  const guide = await page.evaluate(async () => (await fetch("/docs/ui/agent-guide.md")).text());
  assert.ok(guide.includes("Agent 使用入口"));
  const frame = page.frameLocator('iframe[title="独立UI包示例"]');
  await frame.getByRole("button", { name: "执行示例", exact: true }).click();
  await frame.getByRole("status").filter({ hasText: "已触发 1 次本地动作" }).waitFor();
  const control = frame.getByRole("button", { name: "执行示例", exact: true });
  assert.equal(await control.evaluate(element => element.getBoundingClientRect().height), 28);
  const disclosure = frame.getByRole("button", { name: "查看组件职责", exact: true });
  assert.equal(await disclosure.getAttribute("aria-expanded"), "false");
  await disclosure.press("Enter");
  await frame.getByText("基础交互与外观由包内实现负责。业务状态、执行与持久化由宿主提供。", { exact: true }).waitFor();
  assert.equal(await control.evaluate(() => typeof window.arealDesktop), "undefined");
  assert.equal(await control.evaluate(() => [...document.styleSheets].some(sheet => [...sheet.cssRules].some(rule => rule.cssText.includes(".areal-workbench")))), false);
  await page.screenshot({ path: join(scratch, "ui-library-light.png"), fullPage: true });
  await page.getByLabel("主题", { exact: true }).selectOption("dark");
  await page.getByLabel("字号", { exact: true }).selectOption("18");
  await frame.locator("html.dark").waitFor();
  await page.waitForFunction(() => document.querySelector("iframe").contentDocument?.documentElement.style.getPropertyValue("--ui-font-size") === "18px");
  assert.equal(await control.evaluate(element => element.getBoundingClientRect().height), 32);
  assert.equal(await control.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(24, 24, 24)");
  await page.setViewportSize({ width: 420, height: 900 });
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
  assert.equal(await control.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: join(scratch, "ui-library-dark-narrow.png"), fullPage: true });
  checks.push("组件索引、API、llms与Agent原文由包构建输出；稳定/实验入口一致");
  checks.push("独立iframe仅消费包与Tailwind，未加载renderer工作台样式；按钮动作、28/32px字号响应、Disclosure键盘、明暗默认主题与420px布局通过");
  const group = frame.getByRole("button", { name: "读取文件、运行命令 · 30 项活动", exact: true });
  assert.equal(await group.getAttribute("aria-expanded"), "false");
  await group.press("Enter");
  const list = frame.getByRole("region", { name: "分组活动列表", exact: true });
  assert.equal(await list.getByRole("listitem").count(), 30);
  assert.equal(await list.evaluate(element => element.scrollHeight > element.clientHeight && element.scrollWidth <= element.clientWidth), true);
  const detail = list.getByRole("button", { name: "查看首条命令", exact: true });
  await detail.click(); await group.click(); await group.click();
  assert.equal(await detail.getAttribute("aria-expanded"), "true");
  assert.equal(await list.evaluate(element => element.scrollWidth <= element.clientWidth), true, "long command wraps inside the package component");
  await frame.getByRole("button", { name: "显示待核对状态", exact: true }).click();
  await group.click();
  await frame.getByRole("status").filter({ hasText: "退出结果待核对" }).waitFor();
  const image = frame.getByRole("button", { name: "已查看图片 · 本地示例", exact: true });
  assert.equal(await image.getAttribute("aria-expanded"), "false");
  await image.click();
  await frame.getByRole("img", { name: "本地界面参考", exact: true }).waitFor();
  await frame.getByRole("button", { name: "切换图片可用性", exact: true }).click();
  await frame.getByRole("status").filter({ hasText: "图片暂不可用" }).waitFor();
  assert.equal(await image.getAttribute("aria-expanded"), "true", "availability updates keep reading choice");
  const sources = frame.getByRole("region", { name: "输入来源", exact: true });
  assert.equal(await sources.getByRole("button", { name: /^查看来源：/ }).count(), 3);
  await sources.getByRole("button", { name: "查看全部来源（5）", exact: true }).click();
  await frame.getByRole("heading", { name: "全部来源", exact: true }).waitFor();
  assert.equal(await frame.getByRole("button", { name: /^查看来源：/ }).count(), 5);
  await frame.getByRole("button", { name: "返回任务上下文", exact: true }).click();
  await sources.getByRole("button", { name: "折叠来源", exact: true }).click();
  assert.equal(await sources.getByRole("button", { name: /^查看来源：/ }).count(), 0);
  await sources.getByRole("button", { name: "添加来源", exact: true }).click();
  await frame.getByRole("status").filter({ hasText: "已加入草稿" }).waitFor();
  checks.push("实验对话组件从包独立消费：活动纵向滚动/子展开保留、收起可见异常、图片可用性、来源三项/全部/折叠/草稿动作通过");
}
