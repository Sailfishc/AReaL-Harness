import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const entries = JSON.parse(
  await readFile(new URL("../design-system/popup-anchors.json", import.meta.url), "utf8"),
);

// R-HOVERACTIONS-003：在真实布局中检查打开后的锚点与按钮可见性。
export async function runPopupAnchors(page, scratch, checks) {
  page.setDefaultTimeout(10_000);
  const failures = [];
  for (const entry of entries) {
    const samples = [];
    try {
      assert.equal(new URL(page.url()).searchParams.has(entry.page), true, entry.id);
      const row = page.locator(entry.row);
      const trigger = row.locator(entry.trigger);
      const popup = page.locator('[data-slot="dropdown-menu-content"]');
      await row.hover();
      await trigger.click();
      await popup.waitFor({ state: "visible" });
      const measure = async (phase) => {
        // 动画完成后取两个绘制帧，避免把入场缩放算成锚点漂移。
        await popup.evaluate(async (el) => {
          await Promise.all(
            el.getAnimations({ subtree: true }).map((animation) => animation.finished),
          );
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
        });
        const sample = {
          phase,
          popup: await popup.boundingBox(),
          trigger: await trigger.boundingBox(),
          opacity: await trigger.evaluate(
            (el) => getComputedStyle(el.closest('[data-slot="hover-actions"]')).opacity,
          ),
        };
        samples.push(sample);
        assert.ok(sample.popup && sample.trigger, `${entry.id}: ${phase} missing bounding box`);
        for (const target of ["popup", "trigger"])
          for (const axis of ["x", "y"]) {
            const delta = Math.abs(sample[target][axis] - samples[0][target][axis]);
            assert.ok(
              delta <= 1,
              `${entry.id}: ${phase} ${target}.${axis} moved ${delta.toFixed(3)}px (limit 1px)`,
            );
          }
        assert.equal(
          sample.opacity,
          "1",
          `${entry.id}: ${phase} HoverActions opacity=${sample.opacity}`,
        );
      };
      await measure("opened");
      // 模态菜单的透明遮罩会拦截行外元素的 hover actionability；真实鼠标仍可移到该位置。
      const moveTo = async (locator) => {
        const box = await locator.boundingBox();
        assert.ok(box, `${entry.id}: missing pointer destination`);
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      };
      await moveTo(page.locator(entry.leave));
      assert.equal(
        await row.evaluate((el) => el.matches(":hover")),
        false,
        `${entry.id}: pointer left row`,
      );
      await measure("left-row");
      const items = popup.getByRole("menuitem");
      assert.ok(await items.count(), `${entry.id}: no menu items exercised`);
      for (let index = 0; index < (await items.count()); index++) {
        await moveTo(items.nth(index));
        await measure(`menuitem-${index}`);
      }
      const screenshot = join(scratch, `${entry.id}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      checks.push({ id: entry.id, passed: true, samples, screenshot });
    } catch (error) {
      const screenshot = join(scratch, `${entry.id}-failure.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      checks.push({ id: entry.id, passed: false, samples, screenshot, error: error.message });
      failures.push(error);
    } finally {
      await page.keyboard.press("Escape");
      await page.locator('[data-slot="dropdown-menu-content"]').waitFor({ state: "hidden" });
    }
  }
  if (failures.length)
    throw new AggregateError(failures, failures.map((error) => error.message).join("\n"));
}
