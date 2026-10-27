// 对话流活动行与分段标题（CONV-ACTIVITY-01）。verb 与 state 的取值由 conversationPresentation.ts 产生。
export const conversationMessages = {
  "chat.activity.action": {
    "zh-CN":
      "{tense, select, running {正在} done {已} other {}}{verb, select, read {读取} edit {编辑} create {创建} search {搜索} list {列出} command {运行} wait {等待} skillRead {读取技能} planRead {读取计划} readProcess {读取进程输出} terminateProcess {停止进程} browser {使用浏览器} agentSpawn {创建子智能体} agentWait {等待子智能体} image {查看图片} other {调用 {name}}}",
    en: "{tense, select, running {{verb, select, read {Reading} edit {Editing} create {Creating} search {Searching} list {Listing} command {Running} wait {Waiting} skillRead {Reading skill} planRead {Reading plan} readProcess {Reading process output} terminateProcess {Stopping process} browser {Using browser} agentSpawn {Creating subagent} agentWait {Waiting for subagent} image {Viewing image} other {Calling {name}}}} other {{verb, select, read {Read} edit {Edited} create {Created} search {Searched} list {Listed} command {Ran} wait {Waited} skillRead {Read skill} planRead {Read plan} readProcess {Read process output} terminateProcess {Stopped process} browser {Used browser} agentSpawn {Created subagent} agentWait {Waited for subagent} image {Viewed image} other {Called {name}}}}}",
  },
  "chat.activity.run.explore": {
    "zh-CN": "{tense, select, running {正在探索} other {已探索}} · {parts}",
    en: "{tense, select, running {Exploring} other {Explored}} {parts}",
  },
  "chat.activity.run.commands": {
    "zh-CN": "{tense, select, running {正在运行} other {已运行}} {count} 条命令",
    en: "{tense, select, running {Running} other {Ran}} {count, plural, one {# command} other {# commands}}",
  },
  "chat.activity.run.edits": {
    "zh-CN": "{tense, select, running {正在编辑} other {已编辑}} {count} 个文件",
    en: "{tense, select, running {Editing} other {Edited}} {count, plural, one {# file} other {# files}}",
  },
  "chat.activity.run.repeated": {
    "zh-CN": "{action} · {count} 次",
    en: "{action} · {count, plural, one {# time} other {# times}}",
  },
  "chat.activity.run.generic": {
    "zh-CN": "{tense, select, running {正在执行活动} other {已执行活动}}",
    en: "{tense, select, running {Working} other {Worked}}",
  },
  "chat.activity.part.files": {
    "zh-CN": "{count} 个文件",
    en: "{count, plural, one {# file} other {# files}}",
  },
  "chat.activity.part.directories": {
    "zh-CN": "{count} 个目录",
    en: "{count, plural, one {# directory} other {# directories}}",
  },
  "chat.activity.part.searches": {
    "zh-CN": "{count} 次搜索",
    en: "{count, plural, one {# search} other {# searches}}",
  },
  "chat.activity.part.separator": { "zh-CN": "，", en: ", " },
  "chat.activity.reasoning": { "zh-CN": "思考过程", en: "Thinking" },
  "chat.activity.status": {
    "zh-CN":
      "{state, select, running {执行中} failed {失败} unsettled {结果待确认} stopped {已停止} other {已完成}}",
    en: "{state, select, running {Running} failed {Failed} unsettled {Result unconfirmed} stopped {Stopped} other {Completed}}",
  },
  "chat.activity.stillRunning": { "zh-CN": "仍在运行", en: "Still running" },
  "chat.activity.turnFailed": { "zh-CN": "回合失败", en: "Turn failed" },
  "chat.activity.rawRecord": { "zh-CN": "查看工具原始记录", en: "View raw tool record" },
  "chat.activity.openFile": { "zh-CN": "打开 {path}", en: "Open {path}" },
  "chat.command.exitCode": { "zh-CN": "退出码 {code}", en: "exit code {code}" },
} as const;
