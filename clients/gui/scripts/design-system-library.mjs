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
    ["ComposerSurface", "experimental", "wip", "conversation"], ["ComposerToolbar", "experimental", "wip", "conversation"],
    ["Disclosure", "experimental", "wip", "core"], ["ImageDisclosure", "experimental", "wip", "conversation"],
    ["NotificationToast", "experimental", "wip", "core"],
    ["SettingsGroupCard", "experimental", "wip", "core"], ["SettingsPage", "experimental", "wip", "core"],
    ["SettingsRow", "experimental", "wip", "core"], ["SettingsSection", "experimental", "wip", "core"],
    ["SubagentPanel", "experimental", "wip", "conversation"], ["TaskContext", "experimental", "wip", "conversation"],
    ["ThinkingStatus", "experimental", "wip", "conversation"],
    ...["WorktreeDirectory", "WorktreePicker", "WorktreeSettings", "WorktreeStatus", "WorktreeWorkspace"].map(title => [title, "experimental", "wip", "worktree"]),
  ]);
  assert.ok(manifest.components.find(component => component.title === "Button").api.includes("declare function Button"));
  for (const id of ["activity-group", "image-disclosure", "task-context", "subagent-panel", "thinking-status", "composer-surface", "composer-toolbar", "settings-page", "settings-section", "settings-group-card", "settings-row", "worktree-directory", "worktree-picker", "worktree-settings", "worktree-status", "worktree-workspace", "notification-toast"]) {
    const document = await page.evaluate(async id => (await fetch(`/docs/ui/${id}.md`)).text(), id);
    assert.ok(document.includes(`id: ${id}`), `raw contract for ${id}`);
    const component = manifest.components.find(component => component.id === id);
    await library.locator("article").filter({ has: page.getByRole("heading", { name: component.title, exact: true }) }).getByRole("link", { name: "阅读组件合同", exact: true }).click();
    await page.getByRole("heading", { name: new RegExp(`^${component.title} `) }).waitFor();
    const metadata = page.getByRole("region", { name: "组件元数据", exact: true });
    await metadata.getByRole("rowheader", { name: "related", exact: true }).waitFor();
    await metadata.getByRole("link", { name: "查看 Markdown 原文", exact: true }).waitFor();
    const live = page.frameLocator(`iframe[title="${component.title} 独立示例"]`);
    if (id === "thinking-status") {
      await live.getByRole("button", { name: "更新模型摘要", exact: true }).click();
      await live.getByRole("status").filter({ hasText: "对比上下文卡片与资源面板" }).waitFor();
      await live.getByRole("button", { name: "回退 Thinking", exact: true }).click();
      await live.getByRole("status").filter({ hasText: "Thinking" }).waitFor();
      await page.screenshot({ path: join(scratch, "thinking-document-example.png"), fullPage: true });
      await metadata.scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(scratch, "thinking-document-metadata.png"), fullPage: true });
      await page.getByLabel("主题", { exact: true }).selectOption("dark");
      await page.setViewportSize({ width: 420, height: 900 });
      await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
      await page.screenshot({ path: join(scratch, "thinking-document-narrow.png"), fullPage: true });
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    if (id === "composer-surface") {
      const input = live.getByRole("textbox", { name: "示例任务输入", exact: true });
      const send = live.getByRole("button", { name: "发送样例", exact: true });
      assert.equal(await send.isEnabled(), false, "empty input cannot submit");
      await input.fill("保留的Composer草稿");
      await send.click();
      await live.getByRole("status").filter({ hasText: "本地发送动作 1 次" }).waitFor();
      await live.getByLabel("Composer状态", { exact: true }).selectOption("blocked");
      await live.getByRole("status").filter({ hasText: "所选模型暂不可用" }).waitFor();
      assert.equal(await send.isEnabled(), false);
      assert.equal(await input.inputValue(), "保留的Composer草稿");
      assert.equal(await input.isEnabled(), true, "blocked model leaves the draft editable");
      await live.getByLabel("Composer状态", { exact: true }).selectOption("sending");
      assert.equal(await input.isEnabled(), false);
      await live.getByLabel("Composer状态", { exact: true }).selectOption("ready");
      await live.getByRole("button", { name: "添加示例引用", exact: true }).click();
      await live.getByRole("button", { name: "移除 设计引用 1.md", exact: true }).click();
      assert.equal(await input.inputValue(), "保留的Composer草稿");
      await live.getByRole("button", { name: "填入长草稿", exact: true }).click();
      const bounds = await input.evaluate(el => { const editor = el.closest(".composer-editor"); return { full: editor.scrollHeight, visible: editor.clientHeight, overflow: getComputedStyle(editor).overflowY }; });
      assert.ok(bounds.full > bounds.visible && bounds.overflow === "auto", "long draft uses the editor's vertical scroll owner");
      await live.getByLabel("Composer布局", { exact: true }).selectOption("compact");
      await live.getByLabel("Composer状态", { exact: true }).selectOption("running");
      await live.getByRole("button", { name: "停止运行样例", exact: true }).click();
      assert.ok((await input.inputValue()).includes("请核对活动"));
    }
    if (id === "settings-page") {
      const settings = live.getByRole("region", { name: "设置布局样例", exact: true });
      const value = settings.getByRole("textbox", { name: "示例工作区名称", exact: true });
      await value.fill("尚未保存的名称");
      await live.getByLabel("设置反馈状态", { exact: true }).selectOption("pending");
      assert.equal(await value.isEnabled(), false, "host disables actual controls while saving");
      await live.getByLabel("设置反馈状态", { exact: true }).selectOption("unknown");
      await settings.getByRole("status").filter({ hasText: "保存结果待核对" }).waitFor();
      assert.equal(await value.inputValue(), "尚未保存的名称");
      assert.equal(await settings.getByRole("button", { name: "保存样例", exact: true }).isEnabled(), false);
      await live.getByLabel("设置反馈状态", { exact: true }).selectOption("error");
      await settings.getByRole("alert").filter({ hasText: "保存失败" }).waitFor();
      await live.getByLabel("设置反馈状态", { exact: true }).selectOption("ready");
      await settings.getByRole("button", { name: "保存样例", exact: true }).click();
      await settings.getByRole("status").filter({ hasText: "本地样例已保存：尚未保存的名称" }).waitFor();
      await settings.getByRole("button", { name: "查看设置边界", exact: true }).click();
      await settings.getByText("配置值、导航守卫与保存回执仍归宿主。", { exact: true }).waitFor();
      assert.equal(await settings.getByRole("checkbox", { name: "锁定的示例选项", exact: true }).isEnabled(), false);
      const scroll = await settings.locator(".settings-workspace").evaluate(el => ({ overflow: getComputedStyle(el).overflowY, full: el.scrollHeight, height: el.clientHeight }));
      assert.ok(scroll.overflow === "auto" && scroll.full > scroll.height, "settings page owns vertical reading");
      await page.screenshot({ path: join(scratch, "settings-document-example.png"), fullPage: true });
      await page.setViewportSize({ width: 420, height: 900 });
      await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
      assert.equal(await value.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const columns = await settings.locator(".settings-field-layout-wide").first().evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length);
      assert.equal(columns, 1, "narrow group stacks label and control");
      await page.screenshot({ path: join(scratch, "settings-document-narrow.png"), fullPage: true });
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    if (id === "worktree-picker") {
      await live.getByRole("button", { name: "选择起始分支", exact: true }).click();
      const search = live.getByRole("textbox", { name: "搜索示例分支", exact: true });
      await search.fill("feature/");
      const options = live.getByRole("listbox", { name: "示例分支", exact: true });
      const first = options.getByRole("option").first();
      await first.focus(); await first.press("End");
      assert.equal(await options.getByRole("option").last().evaluate(el => document.activeElement === el), true);
      await options.getByRole("option").last().press("Enter");
      await live.getByRole("status").filter({ hasText: "所选分支：feature/" }).waitFor();
      await live.getByLabel("Worktree选项状态", { exact: true }).selectOption("error");
      await live.getByRole("alert").filter({ hasText: "无法读取示例选项" }).waitFor();
      assert.equal(await live.getByRole("button", { name: "选择起始分支", exact: true }).isEnabled(), false);
      await live.getByRole("button", { name: "重试示例选项", exact: true }).click();
      assert.equal(await live.getByRole("button", { name: "选择起始分支", exact: true }).isEnabled(), true);
    }
    if (id === "worktree-status") {
      await live.getByRole("button", { name: "查看创建详情", exact: true }).click();
      await live.getByRole("log", { name: "示例准备输出", exact: true }).waitFor();
      await live.getByLabel("Worktree准备状态", { exact: true }).selectOption("unknown");
      await live.getByRole("status").filter({ hasText: "准备结果待核对" }).waitFor();
      await live.getByRole("button", { name: "收起创建详情", exact: true }).click();
      await live.getByRole("status").filter({ hasText: "准备结果待核对" }).waitFor();
      assert.equal(await live.getByRole("log", { name: "示例准备输出", exact: true }).count(), 0);
      await live.getByLabel("Worktree准备状态", { exact: true }).selectOption("ready");
      assert.equal(await live.getByRole("button", { name: "取消准备样例", exact: true }).count(), 0);
    }
    if (id === "worktree-directory") {
      await live.getByRole("button", { name: "查看目录 示例任务", exact: true }).click();
      await live.getByText("/workspace/worktrees/long-directory/示例任务", { exact: true }).waitFor();
      await live.getByRole("button", { name: "删除目录 示例任务", exact: true }).click();
      await live.getByRole("alert").filter({ hasText: "示例删除受阻" }).waitFor();
      await live.getByRole("button", { name: "查看目录 示例任务", exact: true }).click();
      await live.getByRole("alert").filter({ hasText: "示例删除受阻" }).waitFor();
    }
    if (id === "worktree-settings") {
      await live.getByRole("button", { name: "配置项目 示例项目", exact: true }).click();
      await live.getByRole("button", { name: "编辑环境 本地开发", exact: true }).click();
      const input = live.getByRole("textbox", { name: "示例Setup脚本", exact: true });
      await input.fill("echo keep default");
      await live.getByLabel("示例脚本平台", { exact: true }).selectOption("macos");
      await input.fill("echo keep macOS");
      await live.getByLabel("示例脚本平台", { exact: true }).selectOption("default");
      assert.equal(await input.inputValue(), "echo keep default");
      await live.getByLabel("环境保存状态", { exact: true }).selectOption("saving");
      assert.equal(await input.isEnabled(), false);
      await live.getByLabel("环境保存状态", { exact: true }).selectOption("error");
      assert.equal(await input.inputValue(), "echo keep default");
      await live.getByRole("alert").filter({ hasText: "示例保存失败" }).waitFor();
    }
    if (id.startsWith("worktree-")) {
      await live.locator("body").screenshot({ path: join(scratch, `${id}-example.png`) });
      await page.setViewportSize({ width: 420, height: 900 });
      assert.equal(await live.locator("body").evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await live.locator("body").screenshot({ path: join(scratch, `${id}-narrow.png`) });
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    if (id === "notification-toast") {
      await page.clock.install();
      const colors = new Set();
      for (const label of ["普通", "警告", "成功"]) {
        await live.getByRole("button", { name: `触发${label}提示`, exact: true }).click();
        colors.add(await live.locator(".areal-notification-toast").evaluate(el => getComputedStyle(el).borderColor));
      }
      await live.getByRole("button", { name: "触发错误提示", exact: true }).click();
      await live.getByRole("alert").filter({ hasText: "删除失败" }).waitFor();
      await page.screenshot({ path: join(scratch, "notification-toast-error.png"), fullPage: true });
      assert.equal(await live.locator(".areal-notification-toast").getAttribute("data-tone"), "error");
      colors.add(await live.locator(".areal-notification-toast").evaluate(el => getComputedStyle(el).borderColor));
      assert.equal(colors.size, 4, "four levels have distinct rendered semantic colors");
      await live.getByRole("button", { name: "关闭示例提示", exact: true }).click();
      assert.equal(await live.locator(".areal-notification-toast").count(), 0);
      await live.getByRole("button", { name: "触发成功提示", exact: true }).click();
      await live.getByRole("status").filter({ hasText: "设置已保存" }).waitFor();
      await live.locator(".areal-notification-toast").hover();
      await page.clock.fastForward(6000);
      assert.equal(await live.locator(".areal-notification-toast").isVisible(), true, "hover pauses expiry");
      await live.getByRole("button", { name: "触发普通提示", exact: true }).hover();
      await page.clock.fastForward(5100);
      await live.locator(".areal-notification-toast").waitFor({ state: "hidden", timeout: 1000 });
    }
    if (id === "task-context") {
      const toggle = live.getByRole("button", { name: "任务上下文", exact: true });
      assert.equal(await toggle.getAttribute("aria-expanded"), "false");
      await toggle.click();
      await live.getByRole("region", { name: "输入来源", exact: true }).waitFor();
    }
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
  checks.push("组件索引、API、llms与Agent原文由包构建输出；MD元数据、原文链接、关联组件及独立示例可导航操作，窄窗无横向溢出");
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
  await frame.getByRole("button", { name: "查看子代理", exact: true }).click();
  const agents = frame.getByRole("region", { name: "子代理面板", exact: true });
  await agents.getByRole("button", { name: /独立交互检查.*运行中/ }).click();
  await agents.getByRole("region", { name: "子代理历史对话", exact: true }).getByText("本地子任务历史样例：已读取规范并核对组件接口。", { exact: true }).waitFor();
  await agents.getByRole("button", { name: "返回子代理列表", exact: true }).click();
  await agents.getByRole("button", { name: "关闭子代理面板", exact: true }).click();
}
