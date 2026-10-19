# 模型设置设计验收

final result: passed

范围：本轮方案 2 的信息层级、供应商目录、模型/连接配置标签、顶部搜索，以及参考图 3 的居中模型编辑弹窗。落地现有生产界面；不是另建静态原型。

## 对照来源与状态

- source visual truth: `/Users/sailfish/CodeProject/AReaL-Harness/.scratch/model-settings-redesign/reference-selected.png`（本轮第 2 张生成结果）。
- 弹窗参考：`/Users/sailfish/CodeProject/AReaL-Harness/.scratch/model-settings-redesign/reference-modal.png`（用户提供的参考图 3）。
- implementation screenshot: `/Users/sailfish/CodeProject/AReaL-Harness/.scratch/model-settings-redesign/layout-light.png`；弹窗为 `layout-editor.png` / `layout-editor-detail.png`。
- 最终隔离验收原件：`/private/tmp/ams-S0HPL5`；manifest 为 `/Users/sailfish/CodeProject/AReaL-Harness/.scratch/model-settings-redesign/manifest.json`。
- 主界面 viewport：1440 × 900 CSS px，浅色、Arena、3 个模型，DeepSeek-V4.1-Flash 标记为新会话默认。真实账号未接入；ChatGPT 显示本轮夹具的未登录/读取状态。
- 源图 1553 × 1013 px，裁去外部展示背景后归一到 1440 × 900；实现 2880 × 1800 px，deviceScaleFactor 2，缩至 1440 × 900 后比较。
- 弹窗源图 5344 × 3044 px；在中央 ROI 提取真实弹窗，与实现 1200 × 1044 px 的独立弹窗截图均按 600 px 宽比较。表单保留本产品支持的字段。
- 深色：1440 × 900 CSS px；窄窗口：1000 × 850 CSS px / 2000 × 1700 px，目录在详情上方，页面无横向溢出。

## 同一输入中的对照证据

- 全屏：`/Users/sailfish/CodeProject/AReaL-Harness/.scratch/model-settings-redesign/comparison-full.png`。
- 供应商与模型的局部：`/Users/sailfish/CodeProject/AReaL-Harness/.scratch/model-settings-redesign/comparison-detail.png`。
- 弹窗局部：`/Users/sailfish/CodeProject/AReaL-Harness/.scratch/model-settings-redesign/comparison-modal.png`。
- 深色和窄窗口总览：`/Users/sailfish/CodeProject/AReaL-Harness/.scratch/model-settings-redesign/comparison-responsive.png`。

已实际打开以上四张合成图，放大检查过弹窗、列表与模型搜索。未用分别打开两张图代替合成对照。

## 五个检查面

1. 字体与排印：沿用产品字号、字体和文字层级 Token；名称、状态、模型 ID 与控件标签可辨。模型 ID 仅在显示名称不同的情况下额外展示，避免重复。
2. 间距与结构：供应商目录和详情两栏；模型是默认标签，搜索在结果之前；连接表单与模型列表共享原供应商草稿。窄窗口转为纵向布局，目录保留独立滚动，详情由设置页滚动。
3. 色彩：沿用现有浅/深色和蓝色强调 Token，没有为匹配生成图而另建绿色配色。选中、禁用和未保存状态都保留文字或控件语义。
4. 图像与图标：界面没有需要新增的插画或照片；保留产品已有图标与供应商状态表现，没有手绘生成图中的 Arena 标志或替换应用资产。
5. 文案：默认模型入口在会话配置，行菜单可快捷设置；模型弹窗明确说明保存至供应商草稿，再由供应商保存生效。参考图的上下文长度、工具/视觉/媒体能力开关不在当前可编辑契约中，未绘制虚假控件。

## 发现与迭代

- 初轮发现 [P2]：空推理强度显示“请选择”，不能表达继承供应商值。已在 ModelEditor 使用独立的继承选项值映射回原来的空参数；保存协议不变。最终 model-selection-model-editor-dialog.png 与 confirmed-default-effort.png 已实际打开，确认修复后显示“供应商默认”。
- 后续对照：弹窗位置、双列表单、参数分组、关闭/取消/保存与背景遮罩符合要求；无右侧编辑栏。模型搜索在列表上方，默认模型卡片不再占据模型页首屏。
- 已检查的有意差异：保留现有页面标题、产品图标、蓝色主题、公开控件密度及草稿统一保存动作；不复制参考图的装饰性品牌标记、重复 ID 行和未经支持的能力字段。
- 当前没有需阻止交付的 P0/P1/P2 视觉问题。P3：若之后统一调整设置页的控件密度，应在公共设计系统处理。

## 已执行的交互与边界

最终视觉专项通过：模型行快捷设默认、弹窗新增模型后保存到真实 Core、浅/深色和窄窗口检查。浏览器 pageerror 为空，Core 二进制哈希保持不变，隔离后台 PID 32563 已退出。

模型设置专项另覆盖搜索、弹窗取消与编辑、跨标签草稿、认证保存、实际模型请求、默认模型及冷启动恢复，最终通过（13 项用户路径检查，errors 为空），记录在同目录 model-selection-stable.log 及 model-selection-manifest.json；4 次冷启动的隔离后台均已退出，Core 哈希保持不变。

静态截图不能证明完整可访问性合规；未覆盖真实订阅登录、真实供应商、物理输入法、安装包或签名分发。测试使用隔离数据与本地确定性模型，不改变日用安装。
