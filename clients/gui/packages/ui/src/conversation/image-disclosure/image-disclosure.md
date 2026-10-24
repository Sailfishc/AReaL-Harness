---
id: image-disclosure
title: ImageDisclosure
summary: 工具活动图片默认收起，可用性变化保留阅读选择和引用身份。
status: experimental
entry: wip
layer: conversation
---

# ImageDisclosure 图片活动

用于工具已经查看图片的记录。用户输入附件和最终交付图片继续采用各自内容规范，不自动套用默认收起。

## 组成与状态

具名图片活动入口、可展开内容和不可用反馈。available 时由宿主提供真实图片及查看器；unavailable 时保留活动入口，反馈始终在折叠区外可发现。组件不读取文件、下载远程图片或恢复未知工具动作。

默认收起；同一图片实例的手动展开在父组收起、增量、完成及可用性变化后保留。调用方保持原资源 ID 作 key；切换不同资源时更换身份。图片加载与错误由宿主资源适配器确认，不以名称推断可用性。

## 内容与可访问性

图片保留比例，不撑宽阅读列；宿主图片提供可理解替代文本，查看器打开和关闭的焦点由原阅读器负责。错误文字说明当前问题；阅读该记录不会自动重试或重新加载外部资源。

## 示例与边界

[独立包示例](../../../../../renderer/design-system.html?ui-library)提供真实本地图片和不可用状态；[对话组合](../../../../../renderer/design-system.html?conversation-system)通过原 SentAttachment 查看图片。Props 读取生成 API，实验组件不改变生产工具图片的默认呈现。
