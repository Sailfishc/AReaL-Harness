**中文** | [English](README.en.md)

# @areal/ui

AReaL 的私有 workspace 包，承接首批 CSS 基础值、React 控件、组件合同和 Agent 入口。保留现有视觉，当前不发布 npm。

消费者在 package.json 声明 `"@areal/ui": "workspace:*"`，由 pnpm 接入本地包。包与 npm 发布包使用相同格式；workspace 指本地解析方式，private 阻止误发布。先构建包再构建消费者，GUI 公共脚本已串联该依赖。

稳定组件从 `@areal/ui` 导入；候选组件从 `@areal/ui/wip` 导入。宿主使用 React 19、Base UI 和 Tailwind 4，在 Tailwind 后导入 `@areal/ui/styles.css`。`foundation.css` 提供已采用的 CSS 变量；可选 `themes.css` 提供默认明暗调色板，沿同一纯函数生成。AReaL 宿主仍拥有未迁入的主题别名和保存的偏好。

源值编辑 tokens.json，显式运行 generate，再运行 build 和 check。基础产物生成到 src/generated；主题算法归 src/theme.ts。组件说明与代码就近维护，API 由 TypeScript 声明生成；既有站点消费真实导出，并提供独立示例、components.json、llms.txt 与 Markdown。

首批稳定成员为 Button，Disclosure 由实验入口提供。其他控件和领域组合继续归 renderer，不能把该闭环当作全量迁移或公共稳定版本。开发前读取 [Agent 入口](agent-guide.md)，架构与取舍见仓库 D-004。
