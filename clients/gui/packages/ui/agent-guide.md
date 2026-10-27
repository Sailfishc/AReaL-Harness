# @areal/ui：Agent 使用入口

改界面前按这个顺序读：[包说明](README.md)、[Token 入口](token-reference.md)、所选组件旁的合同（`src/**/<组件>.md`）。改设计系统本身时读[维护者入口](../../design-system/README.md#开工顺序)。组件清单见随包生成的 `dist/llms.txt` 与 `dist/components.json`。

## 纠正先验

下表列出 agent 在本仓库里真实犯过的错。左列是常见直觉，右列是这里的做法。

| 你的直觉 | 在这里的做法 |
| --- | --- |
| 在组件 CSS 里写 `16px`、`#888`、`300ms` | 引用 Token；缺 Token 时先加到 `tokens.json`，再运行 `pnpm --filter @areal/ui generate` |
| 在 `workbench.css` 里用 `.turn-execution .areal-activity-*` 调组件外观 | 给组件加部件或 Token，宿主只管布局 |
| 给组件加 `kind="explore" \| "command"` 这类万能开关 | 用组合部件表达结构，如 `ActivityRow` + `ActivityRowText` + `ActivityRowStatus` |
| 在 md 正文里写数值（如“列表限高 224px”） | 写 Token 名（`--activity-list-max-height`），数值只在 `tokens.json` |
| 手改 `rule-registry.json` 的哈希、标题或 owner | 改合同正文后运行 `node scripts/design-rules.mjs --write` |
| 在 md 里手写行为示例表 | 改行为表（如 `activity-runs.cases.json`），再运行 `node scripts/design-generated.mjs --write` |
| 把外部画布或截图里的数值当来源 | 画布只用于讨论，定下的数值写进 `tokens.json` |
| 只跑 `verify:design` 就说界面没问题 | 再跑 `design:build` 和 `test:design`，视觉结论以浏览器检查为准 |

## 迁移一个组件

对话流活动组与活动行是第一个按这套方法迁移的场景，后续组件照同样步骤做：

1. 把组件 CSS 里的数值换成 Token，缺的先加进 `tokens.json`。
2. 把宿主 CSS 里选中组件内部 class 的规则移回组件；外观差异用部件或 Token 表达。
3. 把合同压到 80 行以内。强制规则写成“规则 + **为什么：** + **推广：** + **检查：**”，检查写测试路径，测试里写明规则 ID。
4. 行为有输入输出时，写成 `*.cases.json` 行为表：测试逐条执行，文档表格由 `design-generated.mjs` 生成。
5. 在 [verified-components.json](../../design-system/verified-components.json) 登记组件，运行 `node scripts/design-rules.mjs --write`、`node scripts/design-verified.mjs` 和 `pnpm verify:design`，全部通过才算迁移完成。
