export const worktreeMessages = {
  "worktree.leavePending": {
    "zh-CN": "保留原结果，返回草稿",
    en: "Keep original result and return to draft",
  },
  "worktree.leavePendingConfirm": {
    "zh-CN":
      "原创建结果仍待核查，目录或空会话可能已存在。保留原记录和资源，不重发该请求，也不发送草稿。返回后可手动选择新的工作区再发送；新请求会创建另一份资源。继续？",
    en: "The original result is still uncertain; its directory or empty conversation may exist. Keep its records and resources without replaying the request or sending the draft. You can then choose a new workspace and send manually, creating a separate resource. Continue?",
  },
  "worktree.recoveryMismatch": {
    "zh-CN": "原创建请求记录不匹配，请检查原工作树；未重新创建。",
    en: "The saved creation request does not match. Inspect the original worktree. No replacement was created.",
  },
  "worktree.configure": { "zh-CN": "新会话工作区", en: "New conversation workspace" },
  "worktree.new": { "zh-CN": "新 Worktree", en: "New worktree" },
  "worktree.automatic": { "zh-CN": "自动隔离", en: "Automatic isolation" },
  "worktree.mode": { "zh-CN": "工作区方式", en: "Workspace mode" },
  "worktree.createOnSend": {
    "zh-CN": "发送首条消息时准备工作区，再开始会话。",
    en: "The workspace is prepared when you send the first message, before the conversation starts.",
  },
  "worktree.automaticDescription": {
    "zh-CN": "来源目录已有会话时，新会话会先创建独立 Worktree。",
    en: "If the source checkout already has a conversation, the new conversation starts in a separate worktree.",
  },
  "worktree.source": { "zh-CN": "来源 Worktree", en: "Source worktree" },
  "worktree.startBranch": { "zh-CN": "起始分支", en: "Starting branch" },
  "worktree.branchName": { "zh-CN": "新分支名称", en: "New branch name" },
  "worktree.generatedBranch": { "zh-CN": "留空时自动生成", en: "Leave empty to generate a name" },
  "worktree.commitOnly": {
    "zh-CN": "从所选提交创建，不复制来源的未提交改动或忽略文件。",
    en: "Starts from the selected commit. Uncommitted changes and ignored files in the source are not copied.",
  },
  "worktree.defaults": { "zh-CN": "Worktree 默认配置", en: "Worktree defaults" },
  "worktree.root": { "zh-CN": "Worktree 根目录", en: "Worktree root" },
  "worktree.defaultRoot": {
    "zh-CN": "使用应用默认目录",
    en: "Use the application default directory",
  },
  "worktree.defaultPrefix": { "zh-CN": "areal", en: "areal" },
  "worktree.prefix": { "zh-CN": "分支名称前缀", en: "Branch name prefix" },
  "worktree.futureOnly": {
    "zh-CN": "默认配置仅影响之后创建的 Worktree，不移动已有目录。",
    en: "Defaults apply only to future worktrees. Existing directories are not moved.",
  },
  "worktree.saveDefaults": { "zh-CN": "保存默认配置", en: "Save defaults" },
  "worktree.saving": { "zh-CN": "正在保存…", en: "Saving…" },
  "worktree.defaultsSaved": { "zh-CN": "默认配置已保存", en: "Defaults saved" },
  "worktree.loading": {
    "zh-CN": "正在读取 Worktree 与分支…",
    en: "Reading worktrees and branches…",
  },
  "worktree.cancel": { "zh-CN": "取消", en: "Cancel" },
  "worktree.useSelection": { "zh-CN": "使用此选择", en: "Use this selection" },
  "worktree.threadWorkspace": { "zh-CN": "Worktree 分支 {branch}", en: "Worktree branch {branch}" },
  "worktree.events": { "zh-CN": "Worktree 创建记录", en: "Worktree creation events" },
  "worktree.creating": { "zh-CN": "正在创建 Worktree", en: "Creating worktree" },
  "worktree.created": {
    "zh-CN": "Worktree 已创建，等待会话绑定",
    en: "Worktree created, waiting for conversation binding",
  },
  "worktree.binding": { "zh-CN": "正在绑定会话工作区", en: "Binding conversation workspace" },
  "worktree.ready": { "zh-CN": "Worktree 已就绪", en: "Worktree ready" },
  "worktree.failed": { "zh-CN": "Worktree 准备失败", en: "Worktree preparation failed" },
  "worktree.unknown": {
    "zh-CN": "Worktree 结果待核对，请勿重复创建",
    en: "Worktree result needs checking. Do not create a duplicate.",
  },
  "worktree.automaticEvent": {
    "zh-CN": "已在执行前自动隔离。来源的未提交改动未复制。",
    en: "Isolated before execution. Uncommitted source changes were not copied.",
  },
} as const;
