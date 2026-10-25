// @ts-check
"use strict";
/** @type {typeof import("./desktop-contract/conversation.cjs")} */
const conversation = require("./desktop-contract/conversation.cjs");
/** @type {typeof import("./desktop-contract/desktop-control.cjs")} */
const desktopControl = require("./desktop-contract/desktop-control.cjs");
/** @type {typeof import("./desktop-contract/conversation.cjs").validateResponse} */
const validateConversationResponse = conversation.validateResponse;
/** @type {typeof import("./desktop-contract/desktop-control.cjs").validateResponse} */
const validateDesktopControlResponse = desktopControl.validateResponse;
const provider = require("./desktop-contract/provider.cjs");
const resourceContract = require("./desktop-contract/resource.cjs");
const catalog = require("./desktop-contract/catalog.cjs");
const trajectory = require("./desktop-contract/trajectory.cjs");
const feedback = require("./desktop-contract/feedback.cjs");
const management = require("./desktop-contract/management.cjs");
const workspace = require("./desktop-contract/workspace.cjs");
const libraryMedia = require("./desktop-contract/library-media.cjs");

/** Raw Electron payloads have no precision until the receiving owner validates them.
 * @typedef {{
 * "areal-core:choose-project":[],
 * "areal-core:choose-projectless-directory":[],
 * "areal-core:choose-task-directory":[],
 * "areal-core:command":[name:unknown,params:unknown],
 * "areal-core:file-open":[request:unknown],
 * "areal-core:install-command-line-tools":[],
 * "areal-core:mcp-app":[request:unknown],
 * "areal-core:mcp-app-deep-link-consumed":[id:unknown],
 * "areal-core:mcp-app-deep-link-target":[],
 * "areal-core:mcp-form-resource":[operation:unknown,request:unknown],
 * "areal-core:notification-consumed":[id:unknown],
 * "areal-core:notification-target":[],
 * "areal-core:present-ready":[],
 * "areal-core:preview":[request:unknown],
 * "areal-core:snapshot":[],
 * "areal-core:theme":[id?:unknown],
 * "areal-core:update-download":[],
 * "areal-core:update-recover-resources":[],
 * "areal-core:update-state":[]
 * }} DesktopInvokeArguments */
/** @typedef {{
 * "areal-core:interface-locale":[locale:unknown],
 * "areal-core:projection-request":[requestId:unknown],
 * "areal-core:quit-decision":[decision:unknown]
 * }} DesktopSendArguments */
/** @typedef {{
 * "areal-core:mcp-app-deep-link":[],
 * "areal-core:mcp-app-event":[event:unknown],
 * "areal-core:notification-open":[],
 * "areal-core:preview-event":[event:unknown],
 * "areal-core:projection":[message:unknown],
 * "areal-core:quit-progress":[progress:unknown],
 * "areal-core:quit-request":[id:unknown],
 * "areal-core:theme-changed":[theme:unknown],
 * "areal-core:update-changed":[state:unknown]
 * }} DesktopEventArguments */
/** @typedef {<N extends keyof DesktopInvokeArguments>(channel:N,...args:DesktopInvokeArguments[N])=>Promise<unknown>} DesktopInvoke */
/** @typedef {<N extends keyof DesktopSendArguments>(channel:N,...args:DesktopSendArguments[N])=>void} DesktopSend */

/** @typedef {{state:'idle'}|{state:'quitting',phase:'checking'|'stopping'|'finishing'}} QuitProgress */
/** @typedef {{id:number,pluginId:string,marketplace?:string,toolName:string,path:string}} McpAppDeepLink */
/** @typedef {{projectId:string}&({threadId:string,taskId?:never}|{taskId:string,runId?:string,questionId?:string})} NotificationTarget */

/** @template {keyof DesktopInvokeArguments} N @typedef {(...args:DesktopInvokeArguments[N])=>Promise<unknown>} BridgeInvoke */
/** The preload transport stays opaque; the renderer adapter owns response decoding. */
/** @typedef {{
 * command:BridgeInvoke<'areal-core:command'>,snapshot:BridgeInvoke<'areal-core:snapshot'>,
 * presentReady:BridgeInvoke<'areal-core:present-ready'>,installCommandLineTools:BridgeInvoke<'areal-core:install-command-line-tools'>,
 * chooseProject:BridgeInvoke<'areal-core:choose-project'>,chooseTaskDirectory:BridgeInvoke<'areal-core:choose-task-directory'>,
 * chooseProjectlessDirectory:BridgeInvoke<'areal-core:choose-projectless-directory'>,fileOpen:BridgeInvoke<'areal-core:file-open'>,
 * theme:BridgeInvoke<'areal-core:theme'>,preview:BridgeInvoke<'areal-core:preview'>,
 * updateState:BridgeInvoke<'areal-core:update-state'>,downloadUpdate:BridgeInvoke<'areal-core:update-download'>,
 * recoverUpdateResources:BridgeInvoke<'areal-core:update-recover-resources'>,
 * mcpApp:BridgeInvoke<'areal-core:mcp-app'>,mcpFormResource:BridgeInvoke<'areal-core:mcp-form-resource'>,
 * setInterfaceLocale:(locale:unknown)=>void,requestProjection:(requestId:unknown)=>void,
 * onProjection:(listener:(value:unknown)=>void)=>()=>void,
 * onPreviewEvent:(listener:(value:unknown)=>void)=>()=>void,onTheme:(listener:(value:unknown)=>void)=>()=>void,
 * onUpdate:(listener:(value:unknown)=>void)=>()=>void,onMcpAppEvent:(listener:(value:unknown)=>void)=>()=>void,
 * onQuitProgress:(listener:(value:QuitProgress)=>void)=>()=>void,
 * onQuitRequested:(listener:()=>boolean|Promise<boolean>)=>()=>void,
 * onNotificationOpen:(listener:(value:NotificationTarget)=>void)=>()=>void,
 * onMcpAppDeepLink:(listener:(value:McpAppDeepLink)=>void|Promise<void>)=>()=>void
 * }} DesktopBridge */

/** @typedef {{message:string, code?:string|number, reason?:string, submissionUnknown?:boolean, requestId?:string, delivery?:'resultUnavailable', outcome?:import('../../runtime-client/core.js').FailureOutcome, recovery?:import('../../runtime-client/core.js').Recovery}} DesktopError */
/** @template T @typedef {{ok:true,value:T}|{ok:false,error:DesktopError}} DesktopResult */
/** @typedef {import('./desktop-contract/conversation.cjs').ResourceRef} ResourceRef */
/** @typedef {import('./desktop-contract/conversation.cjs').Request<'prepareCreator'>} PrepareCreatorRequest */
/** @typedef {import('./desktop-contract/conversation.cjs').WorktreeSpec} WorktreeSpec */
/** @typedef {import('./desktop-contract/conversation.cjs').ConfigureRequest} ConfigureRequest */
/** @typedef {import('./desktop-contract/conversation.cjs').SideRequest} SideRequest */
/** @typedef {import('./desktop-contract/conversation.cjs').Request<'continue'>} ContinueRequest */
/** @typedef {import('./desktop-contract/conversation.cjs').ForkRequest} ForkRequest */
/** @typedef {import('./desktop-contract/conversation.cjs').HistoryRequest} HistoryRequest */
/** @typedef {import('./desktop-contract/trajectory.cjs').TrajectoryRequest} TrajectoryRequest */
/** @typedef {import('./desktop-contract/trajectory.cjs').TrajectoryRecord} TrajectoryRecord */
/** @typedef {import('./desktop-contract/trajectory.cjs').TrajectoryModelCallSummary} TrajectoryModelCallSummary */
/** @typedef {import('./desktop-contract/trajectory.cjs').TrajectoryStatus} TrajectoryStatus */

/** @typedef {{effect:'read'|'subscription'|'mutation',requestId?:'requestId'|'draftId'}} CommandEffect */
/** @type {CommandEffect} */
const read = Object.freeze({ effect: "read" });
/** @type {CommandEffect} */
const subscription = Object.freeze({ effect: "subscription" });
/** @type {CommandEffect} */
const mutation = Object.freeze({ effect: "mutation" });
/** @type {CommandEffect} */
const recoverable = Object.freeze({ effect: "mutation", requestId: "requestId" });
/** @param {CommandEffect} semantics @param {string} names */
const operations = (semantics, names) =>
  Object.fromEntries(names.split(" ").map((name) => [name, semantics]));
/** @satisfies {Record<keyof Requests,readonly ['main'|'service','app'|'project'|'thread',CommandEffect|Record<string,CommandEffect>]>} */
const commandDefinitions = Object.freeze({
  connect: ["service", "project", subscription],
  list: ["service", "project", read],
  open: ["service", "thread", subscription],
  history: ["service", "thread", operations(read, "acquire loadOlder loadItem release")],
  create: ["service", "project", recoverable],
  prepareCreator: ["service", "project", mutation],
  fork: ["service", "project", recoverable],
  side: [
    "service",
    "project",
    {
      ...operations(read, "recover context list"),
      ...operations(recoverable, "start send create close"),
    },
  ],
  prediction: ["service", "thread", mutation],
  send: ["service", "thread", recoverable],
  editMessage: ["service", "thread", recoverable],
  continue: ["service", "thread", recoverable],
  stop: ["service", "thread", recoverable],
  attachBrowser: ["service", "thread", recoverable],
  respond: ["service", "thread", mutation],
  reconcile: ["service", "project", read],
  configure: ["service", "thread", recoverable],
  queue: ["service", "thread", read],
  queueEdit: ["service", "thread", recoverable],
  library: [
    "service",
    "app",
    operations(
      mutation,
      "dropSidebar renameProject renameThread pinThread pinProject createSection renameSection removeSection orderSection moveThread moveProject readThread markAllRead orderSidebarThread hideProject orderProject orderThread settings",
    ),
  ],
  manage: [
    "service",
    "project",
    {
      ...operations(
        read,
        "pluginHooks pluginMcp mcpApps genUiSource mcpForms mcpToolResult plugins plugin providers mcp profile skills skill inspect context inheritedHistory plan processes process processWait goal permissions interactions processOutput executions execution executionArtifact executionWait agents agentWait workflows server workflow workgroupPolicy workgroups workgroup workgroupWait workgroupArtifact workgroupArtifactStatus workgroupCapabilities workgroupSubmission pluginCapabilities pluginReadiness pluginSubmission processSubmission agentSubmission mcpFormResourceSubmission tasks task taskInbox taskChannel taskDraftHistory taskDraftRead taskSchedulePreview taskScheduleContext taskHistoryCapabilities taskRuns taskRun",
      ),
      ...operations(subscription, "taskWatch taskUnwatch"),
      ...operations(
        recoverable,
        "pluginArchiveImport mcpFormResourceStage pluginHooksConfigure hookAcknowledge marketplaceAdd marketplaceAddGit marketplaceRemove marketplaceUpdate pluginResolve pluginAuthConfigure pluginConnection connectorConfigure connectorCredential pluginInstall pluginConfigure pluginComponentConfigure pluginUninstall pluginSetup providerSave providerRemove mcpSave mcpConnect mcpDisconnect archive unarchive processCloseStdin processStart processWrite processResize processTerminate goalCreate goalUpdate goalPause goalResume goalClear workgroupStart workflowStart workgroupRevise agentSpawn taskCreate taskUpdate taskRunNow taskPause taskResume taskStopRun taskResumeRun taskCancel taskDelete taskReply taskDraftSend",
      ),
      ...operations(
        mutation,
        "pluginArchivePick pluginAuth pluginAuthCredential mcpAppOpen mcpAppOpenFromResult mcpAppRequest mcpAppClose mcpExtensionCall mcpFormRespond mcpFormPreview mcpFormResourcePrepare mcpFormResourceRelease executionCancel executionApply serverDrain serverGc workgroupApplyArtifact workgroupCancel closeResources planUpdate toolAcknowledge contextCompact permissionsForget providerProbe taskDraftConfirm",
      ),
      taskDraftStart: { effect: "mutation", requestId: "draftId" },
    },
  ],
  workspace: [
    "service",
    "project",
    {
      ...operations(
        read,
        "worktreeList worktreeOptions worktreeRead list search read review reviewCommits reviewBranches turnReview status info gitState",
      ),
      ...operations(recoverable, "worktreeCreate worktreeAction worktreeDelete"),
      ...operations(
        mutation,
        "worktreeSettings worktreeEnvironmentSave worktreeEnvironmentDelete worktreeCancel worktreeOpen save gitStage gitUnstage gitCommit gitPush",
      ),
    },
  ],
  media: [
    "service",
    "thread",
    { ...operations(read, "list read"), upload: mutation, release: recoverable },
  ],
  steer: ["service", "thread", recoverable],
  dismissRecovery: ["service", "project", mutation],
  providers: [
    "service",
    "app",
    {
      ...operations(read, "list revealKey discover"),
      ...operations(
        mutation,
        "probe apply save saveAndApply removeAndApply defaultAndApply remove default",
      ),
    },
  ],
  chatgpt: [
    "service",
    "app",
    operations(mutation, "status login forget logout selectAccount cancel probe"),
  ],
  analytics: ["service", "app", { ...operations(read, "read sync") }],
  resources: [
    "service",
    "app",
    {
      ...operations(read, "hooks builtinSkill skills mcp skillRead"),
      ...operations(mutation, "hooksSave skillToggle skillSave mcpSave mcpConnect mcpDisconnect"),
    },
  ],
  projectless: ["service", "app", { catalog: read, directory: mutation, prepare: recoverable }],
  tasks: ["service", "app", operations(read, "list inbox preview observe")],
  trajectory: ["service", "app", { status: read, ...operations(mutation, "retry setEnabled") }],
  feedback: [
    "service",
    "app",
    {
      ...operations(read, "status read"),
      ...operations(mutation, "preference prepare draft refine submit close"),
    },
  ],
  serviceLifecycle: [
    "main",
    "app",
    { check: read, ...operations(mutation, "update stop recover quitInterface stopAndQuit") },
  ],
  serviceStatus: ["main", "app", read],
  stopService: ["main", "app", mutation],
  recoverResources: ["main", "app", mutation],
  browserData: [
    "main",
    "app",
    { status: read, ...operations(mutation, "importChrome clearCache clearAll") },
  ],
  computerControl: [
    "main",
    "app",
    { status: read, ...operations(mutation, "requestAccess openSettings restart stop") },
  ],
  exportDiagnostics: ["main", "app", read],
  connectService: ["main", "app", subscription],
  export: ["main", "thread", read],
  remoteControl: ["main", "app", mutation],
});
/** @param {string} name @param {Record<string,unknown>} request @returns {CommandEffect} */
function commandSemantics(name, request) {
  const definition = commandDefinitions[/** @type {CommandName} */ (name)];
  if (!definition) invalid();
  const declared = /** @type {CommandEffect|Record<string,CommandEffect>} */ (definition[2]);
  const selected =
    typeof declared.effect === "string"
      ? /** @type {CommandEffect} */ (declared)
      : /** @type {Record<string,CommandEffect>} */ (declared)[String(request.operation)];
  if (!selected || !["read", "subscription", "mutation"].includes(selected.effect)) invalid();
  return selected;
}
/** @typedef {keyof typeof commandDefinitions} CommandName */
/** @typedef {import('./desktop-contract/conversation.cjs').Requests & import('./desktop-contract/desktop-control.cjs').Requests & {
 * providers:import('./desktop-contract/provider.cjs').Request<'providers'>,
 * chatgpt:import('./desktop-contract/provider.cjs').Request<'chatgpt'>,
 * resources:import('./desktop-contract/resource.cjs').Request<'resources'>,
 * analytics:import('./desktop-contract/catalog.cjs').Request<'analytics'>,
 * projectless:import('./desktop-contract/catalog.cjs').Request<'projectless'>,
 * tasks:import('./desktop-contract/catalog.cjs').Request<'tasks'>,
 * trajectory:TrajectoryRequest,feedback:import('./desktop-contract/feedback.cjs').Request<'feedback'>,
 * manage:import('./desktop-contract/management.cjs').ManagementRequest,
 * workspace:import('./desktop-contract/workspace.cjs').WorkspaceRequest,
 * library:import('./desktop-contract/library-media.cjs').LibraryRequest,
 * media:import('./desktop-contract/library-media.cjs').MediaRequest
 * }} Requests */
/** @template {string} N @typedef {N extends keyof Requests ? Requests[N] : never} CommandParams */
/** @typedef {{[N in CommandName]:{name:N,request:CommandParams<N>}}[CommandName]} CommandInvocation */
/** @param {string} name @param {unknown} request @param {{serviceOnly?:boolean}} [options] @returns {CommandInvocation} */
function readCommandInvocation(name, request, options = { serviceOnly: true }) {
  const invocation = { name, request };
  if (!isCommandInvocation(invocation, options)) invalid();
  return invocation;
}
/** @param {{name:string,request:unknown}} invocation @param {{serviceOnly?:boolean}} options @returns {invocation is CommandInvocation} */
function isCommandInvocation(invocation, options) {
  validateCommand(invocation.name, invocation.request, options);
  return true;
}
/** @typedef {import('./desktop-contract/conversation.cjs').PrepareCreatorResponse} PrepareCreatorResponse */
/** @typedef {import('./desktop-contract/conversation.cjs').TurnAdmission} ContinueResponse */
/** @typedef {import('./desktop-contract/conversation.cjs').Created} ForkResponse */
/** @template {SideRequest} P @typedef {import('./desktop-contract/conversation.cjs').SideResponse<P>} SideResponse */
/** @template {CommandName} N @template {CommandParams<N>} [P=CommandParams<N>]
 * @typedef {N extends import('./desktop-contract/conversation.cjs').Name ? import('./desktop-contract/conversation.cjs').Response<N,P>
 * : N extends import('./desktop-contract/desktop-control.cjs').Name ? import('./desktop-contract/desktop-control.cjs').Response<N,P>
 * : N extends 'providers'|'chatgpt' ? import('./desktop-contract/provider.cjs').Response<N,P>
 * : N extends 'resources' ? import('./desktop-contract/resource.cjs').Response<N,P>
 * : N extends 'analytics'|'projectless'|'tasks' ? import('./desktop-contract/catalog.cjs').Response<N,P>
 * : N extends 'trajectory' ? import('./desktop-contract/trajectory.cjs').Response<N,P>
 * : N extends 'feedback' ? import('./desktop-contract/feedback.cjs').Response<N,P>
 * : N extends 'manage' ? import('./desktop-contract/management.cjs').ManagementResponse<Extract<P,Requests['manage']>>
 * : N extends 'workspace' ? import('./desktop-contract/workspace.cjs').WorkspaceResponse<Extract<P,Requests['workspace']>>
 * : N extends 'library' ? import('./desktop-contract/library-media.cjs').LibraryState
 * : N extends 'media' ? import('./desktop-contract/library-media.cjs').MediaResponse<Extract<P,Requests['media']>> : never} CommandResponse */
/** @typedef {'show'|'navigate'|'back'|'forward'|'reload'|'stop'|'state'|'external'|'devtools'|'openLink'|'release'|'claim'|'takeover'|'captureRegion'|'captureElement'|'selectElement'|'cancelElementSelection'|'checkElement'|'endRegion'|'beginStyleTrial'|'applyStyleTrial'|'undoStyleTrial'|'redoStyleTrial'|'styleTrialState'|'captureStyleTrialAfter'|'clearStyleTrial'|'newPage'|'selectPage'|'subscribe'|'unsubscribe'|'allowNextDownload'|'cancelFileHandoff'|'cancelDownload'|'authorizeFrameOrigin'|'reloadFrameOrigin'|'revokeFrameOrigin'} OwnedPreviewOperation */
/** @typedef {{projectId:string,threadId:string,pageId?:string,captureId?:string,downloadId?:string,url?:string,userIntent?:boolean,visible?:boolean,bounds?:{x:number,y:number,width:number,height:number},[key:string]:unknown}} PreviewOwner */
/** @typedef {PreviewOwner & (
 * {operation:'show'|'back'|'forward'|'reload'|'stop'|'state'|'external'|'devtools'|'claim'|'takeover'|'captureRegion'|'captureElement'|'cancelElementSelection'|'newPage'|'subscribe'|'unsubscribe'}
 * | {operation:'navigate'|'openLink',url:string}
 * | {operation:'release',userIntent:true}
 * | {operation:'selectPage'|'cancelFileHandoff',pageId:string}
 * | {operation:'authorizeFrameOrigin'|'reloadFrameOrigin'|'revokeFrameOrigin'|'allowNextDownload',pageId:string,userIntent:true}
 * | {operation:'cancelDownload',pageId:string,downloadId:string,userIntent:true}
 * | {operation:'endRegion',pageId:string,captureId:string}
 * | {operation:'checkElement'|'beginStyleTrial',pageId:string,captureId:string,elementId:string}
 * | {operation:'selectElement',pageId:string,captureId:string,x:number,y:number}
 * | {operation:'applyStyleTrial',pageId:string,trialId:string,property:string,value:string}
 * | {operation:'undoStyleTrial'|'redoStyleTrial'|'styleTrialState'|'captureStyleTrialAfter'|'clearStyleTrial',pageId:string,trialId:string}
 * )} OwnedPreviewRequest */
/** Hide without a capture deliberately allows unscoped owner fields; Main decides global hiding.
 * @typedef {OwnedPreviewRequest | {operation:'hide',captureId:string,projectId:string,threadId:string,pageId:string,[key:string]:unknown}
 * | {operation:'hide',captureId?:undefined,projectId?:unknown,threadId?:unknown,pageId?:unknown,[key:string]:unknown}} PreviewRequest */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
/** @param {unknown} value @returns {value is string} */
function identifier(value) {
  return typeof value === "string" && !!value.trim() && value.length <= 256;
}
/** @returns {never} */
function invalid() {
  throw Object.assign(new Error("无效桌面操作或参数"), { code: "INVALID_DESKTOP_REQUEST" });
}
/** @template {string} N @overload @param {N} name @param {unknown} params @param {{serviceOnly?:boolean}} [options] @returns {asserts params is CommandParams<N>} */
/** @param {string} name @param {unknown} params @param {{serviceOnly?:boolean}} [options] */
function validateCommand(name, params, { serviceOnly = false } = {}) {
  if (!Object.hasOwn(commandDefinitions, name) || !record(params)) invalid();
  const [layer, scope] = commandDefinitions[/** @type {CommandName} */ (name)];
  if (serviceOnly && layer !== "service") invalid();
  if (
    scope !== "app" &&
    !(
      name === "workspace" &&
      ["worktreeList", "worktreeSettings"].includes(String(params.operation))
    ) &&
    !identifier(params.projectId)
  )
    invalid();
  if (scope === "thread" && !identifier(params.threadId)) invalid();
  switch (name) {
    case "connect":
    case "list":
    case "open":
    case "history":
    case "create":
    case "prepareCreator":
    case "fork":
    case "side":
    case "prediction":
    case "send":
    case "editMessage":
    case "continue":
    case "stop":
    case "attachBrowser":
    case "respond":
    case "reconcile":
    case "configure":
    case "queue":
    case "queueEdit":
    case "steer":
    case "dismissRecovery":
      if (!conversation.isRequest(name, params)) invalid();
      return;
    case "serviceLifecycle":
    case "serviceStatus":
    case "stopService":
    case "recoverResources":
    case "browserData":
    case "computerControl":
    case "exportDiagnostics":
    case "connectService":
    case "export":
    case "remoteControl":
      if (!desktopControl.isRequest(name, params)) invalid();
      return;
    case "resources":
      if (!resourceContract.isRequest(name, params)) invalid();
      return;
    case "analytics":
    case "projectless":
    case "tasks":
      if (!catalog.isRequest(name, params)) invalid();
      return;
    case "trajectory":
      if (!trajectory.isRequest(name, params)) invalid();
      return;
    case "feedback":
      if (!feedback.isRequest(name, params)) invalid();
      return;
    case "providers":
    case "chatgpt":
      provider.readRequest(name, params);
      return;
    case "manage":
      if (!management.isManagementRequest(params)) invalid();
      return;
    case "workspace":
      if (!workspace.isWorkspaceRequest(params)) invalid();
      return;
    case "library":
      if (!libraryMedia.isLibraryRequest(params)) invalid();
      return;
    case "media":
      if (!libraryMedia.isMediaRequest(params)) invalid();
      return;
    default:
      invalid();
  }
}

/** @type {(request:unknown)=>asserts request is PreviewRequest} */
const validatePreview = (request) => {
  if (!record(request) || typeof request.operation !== "string") invalid();
  if (request.operation === "hide") {
    if (
      request.captureId !== undefined &&
      (!identifier(request.captureId) ||
        !identifier(request.projectId) ||
        !identifier(request.threadId) ||
        !identifier(request.pageId))
    )
      invalid();
    return;
  }
  if (
    ![
      "show",
      "navigate",
      "back",
      "forward",
      "reload",
      "stop",
      "state",
      "external",
      "devtools",
      "openLink",
      "release",
      "claim",
      "takeover",
      "captureRegion",
      "captureElement",
      "selectElement",
      "cancelElementSelection",
      "checkElement",
      "endRegion",
      "beginStyleTrial",
      "applyStyleTrial",
      "undoStyleTrial",
      "redoStyleTrial",
      "styleTrialState",
      "captureStyleTrialAfter",
      "clearStyleTrial",
      "newPage",
      "selectPage",
      "subscribe",
      "unsubscribe",
      "allowNextDownload",
      "cancelFileHandoff",
      "cancelDownload",
      "authorizeFrameOrigin",
      "reloadFrameOrigin",
      "revokeFrameOrigin",
    ].includes(String(request.operation)) ||
    !identifier(request.projectId) ||
    !identifier(request.threadId)
  )
    invalid();
  if (
    ["authorizeFrameOrigin", "reloadFrameOrigin", "revokeFrameOrigin"].includes(
      String(request.operation),
    ) &&
    (!identifier(request.pageId) ||
      request.userIntent !== true ||
      Object.keys(request).some(
        (key) => !["operation", "projectId", "threadId", "pageId", "userIntent"].includes(key),
      ))
  )
    invalid();
  if (request.url !== undefined && typeof request.url !== "string") invalid();
  if (request.pageId !== undefined && !identifier(request.pageId)) invalid();
  if (request.captureId !== undefined && !identifier(request.captureId)) invalid();
  if (request.downloadId !== undefined && !identifier(request.downloadId)) invalid();
  if (
    ["allowNextDownload", "cancelFileHandoff", "cancelDownload"].includes(
      String(request.operation),
    ) &&
    Object.keys(request).some(
      (key) =>
        !["operation", "projectId", "threadId", "pageId", "downloadId", "userIntent"].includes(key),
    )
  )
    invalid();
  if (
    ["allowNextDownload", "cancelFileHandoff", "cancelDownload"].includes(
      String(request.operation),
    ) &&
    !identifier(request.pageId)
  )
    invalid();
  if (request.operation === "cancelDownload" && !identifier(request.downloadId)) invalid();
  if (
    ["allowNextDownload", "cancelDownload"].includes(String(request.operation)) &&
    request.userIntent !== true
  )
    invalid();
  if (
    request.operation === "endRegion" &&
    (!identifier(request.pageId) || !identifier(request.captureId))
  )
    invalid();
  if (
    request.operation === "checkElement" &&
    (!identifier(request.pageId) || !identifier(request.captureId))
  )
    invalid();
  if (request.operation === "checkElement" && !identifier(request.elementId)) invalid();
  if (
    request.operation === "selectElement" &&
    (!identifier(request.pageId) ||
      !identifier(request.captureId) ||
      ![request.x, request.y].every(
        (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0,
      ))
  )
    invalid();
  if (
    request.operation === "beginStyleTrial" &&
    (!identifier(request.pageId) ||
      !identifier(request.captureId) ||
      !identifier(request.elementId))
  )
    invalid();
  if (
    [
      "applyStyleTrial",
      "undoStyleTrial",
      "redoStyleTrial",
      "styleTrialState",
      "captureStyleTrialAfter",
      "clearStyleTrial",
    ].includes(String(request.operation)) &&
    (!identifier(request.pageId) || !identifier(request.trialId))
  )
    invalid();
  if (
    request.operation === "applyStyleTrial" &&
    (typeof request.property !== "string" ||
      typeof request.value !== "string" ||
      request.property.length > 40 ||
      request.value.length > 500)
  )
    invalid();
  if (request.userIntent !== undefined && typeof request.userIntent !== "boolean") invalid();
  if (request.operation === "release" && request.userIntent !== true) invalid();
  if (request.operation === "selectPage" && !identifier(request.pageId)) invalid();
  if (
    ["navigate", "openLink"].includes(String(request.operation)) &&
    typeof request.url !== "string"
  )
    invalid();
  if (request.visible !== undefined && typeof request.visible !== "boolean") invalid();
  const bounds = request.bounds;
  if (
    bounds !== undefined &&
    (!record(bounds) ||
      !["x", "y", "width", "height"].every(
        (key) => typeof bounds[key] === "number" && Number.isFinite(bounds[key]),
      ))
  )
    invalid();
};

/** @param {unknown} error @returns {DesktopError} */
function desktopError(error) {
  const value = record(error) || error instanceof Error ? error : {};
  const code = "code" in value ? value.code : undefined;
  const requestId = "requestId" in value ? value.requestId : undefined;
  const reason =
    "data" in value && record(value.data) && typeof value.data.reason === "string"
      ? value.data.reason
      : "reason" in value && typeof value.reason === "string"
        ? value.reason
        : undefined;
  const data = "data" in value && record(value.data) ? value.data : {};
  const rawOutcome = "outcome" in value ? value.outcome : data.outcome;
  const rawRecovery = "recovery" in value ? value.recovery : data.recovery;
  /** @type {DesktopError['outcome']} */
  let outcome;
  if (record(rawOutcome) && (rawOutcome.kind === "noMutation" || rawOutcome.kind === "rejected"))
    outcome = { kind: rawOutcome.kind };
  if (
    record(rawOutcome) &&
    (rawOutcome.kind === "admitted" || rawOutcome.kind === "unconfirmed") &&
    record(rawOutcome.operation)
  ) {
    const op = rawOutcome.operation;
    const target = op.target;
    if (
      typeof op.method === "string" &&
      /^[A-Za-z][A-Za-z0-9/]*$/.test(op.method) &&
      op.method.length <= 128 &&
      (op.requestId === undefined || identifier(op.requestId)) &&
      record(target)
    ) {
      /** @type {import('../../runtime-client/core.js').OperationTarget | undefined} */
      let safeTarget;
      if (target.kind === "project") safeTarget = { kind: "project" };
      if (target.kind === "thread" && identifier(target.threadId))
        safeTarget = { kind: "thread", threadId: String(target.threadId) };
      if (target.kind === "task" && identifier(target.taskId))
        safeTarget = { kind: "task", taskId: String(target.taskId) };
      if (safeTarget)
        outcome = {
          kind: rawOutcome.kind,
          operation: {
            method: op.method,
            ...(typeof op.requestId === "string" ? { requestId: op.requestId } : {}),
            target: safeTarget,
          },
        };
    }
  }
  /** @type {DesktopError['recovery']} */
  const recovery =
    record(rawRecovery) &&
    ["retryRead", "queryOriginal", "needsUser", "none"].includes(String(rawRecovery.kind))
      ? { kind: /** @type {NonNullable<DesktopError['recovery']>['kind']} */ (rawRecovery.kind) }
      : undefined;
  const originalId = outcome && "operation" in outcome ? outcome.operation.requestId : requestId;
  const unknown = outcome
    ? outcome.kind === "admitted" || outcome.kind === "unconfirmed"
    : "submissionUnknown" in value && value.submissionUnknown === true;
  return {
    message: typeof value.message === "string" ? value.message.slice(0, 4096) : "桌面操作失败",
    ...(typeof code === "string" || typeof code === "number" ? { code } : {}),
    ...(unknown ? { submissionUnknown: true } : {}),
    ...(typeof originalId === "string" && identifier(originalId) ? { requestId: originalId } : {}),
    ...(reason ? { reason: reason.slice(0, 128) } : {}),
    ...(("delivery" in value ? value.delivery : data.delivery) === "resultUnavailable"
      ? { delivery: /** @type {const} */ ("resultUnavailable") }
      : {}),
    ...(outcome ? { outcome } : {}),
    ...(recovery ? { recovery } : {}),
  };
}

/** A malformed response does not establish whether a write was admitted. */
/** @param {string} name @param {Record<string,unknown>} params @param {unknown} cause */
function commandResponseError(name, params, cause) {
  const semantics = commandSemantics(name, params);
  const write = semantics.effect === "mutation";
  const requestId = semantics.requestId ? params[semantics.requestId] : undefined;
  return Object.assign(new Error("Invalid Desktop command response", { cause }), {
    code: "DESKTOP_RESPONSE_INVALID",
    ...(typeof requestId === "string" ? { requestId } : {}),
    ...(write
      ? {
          submissionUnknown: true,
          outcome: { kind: "unconfirmed" },
          recovery: { kind: "queryOriginal" },
        }
      : { outcome: { kind: "noMutation" }, recovery: { kind: "retryRead" } }),
  });
}

/** @template {CommandName} N @template {CommandParams<N>} P @overload
 * @param {N} name @param {P} params @param {unknown} value @returns {asserts value is CommandResponse<N,P>} */
/** @param {string} name @param {unknown} params @param {unknown} value */
function validateCommandResponse(name, params, value) {
  const invocation = readCommandInvocation(name, params, { serviceOnly: false });
  switch (invocation.name) {
    case "connect":
    case "list":
    case "open":
    case "history":
    case "create":
    case "prepareCreator":
    case "fork":
    case "side":
    case "prediction":
    case "send":
    case "editMessage":
    case "continue":
    case "stop":
    case "attachBrowser":
    case "respond":
    case "reconcile":
    case "configure":
    case "queue":
    case "queueEdit":
    case "steer":
    case "dismissRecovery":
      validateConversationResponse(invocation.name, invocation.request, value);
      return;
    case "serviceLifecycle":
    case "serviceStatus":
    case "stopService":
    case "recoverResources":
    case "browserData":
    case "computerControl":
    case "exportDiagnostics":
    case "connectService":
    case "export":
    case "remoteControl":
      validateDesktopControlResponse(invocation.name, invocation.request, value);
      return;
    case "providers":
    case "chatgpt":
      if (provider.isResponse(invocation.name, invocation.request, value)) return;
      break;
    case "resources":
      if (resourceContract.isResponse(invocation.name, invocation.request, value)) return;
      break;
    case "analytics":
    case "projectless":
    case "tasks":
      if (catalog.isResponse(invocation.name, invocation.request, value)) return;
      break;
    case "trajectory":
      if (trajectory.isResponse(invocation.name, invocation.request, value)) return;
      break;
    case "feedback":
      if (feedback.isResponse(invocation.name, invocation.request, value)) return;
      break;
    case "manage":
      management.validateManagementResponse(invocation.request, value);
      return;
    case "workspace":
      workspace.validateWorkspaceResponse(invocation.request, value);
      return;
    case "library":
      if (libraryMedia.isLibraryState(value)) return;
      break;
    case "media":
      libraryMedia.validateMediaResponse(invocation.request, value);
      return;
  }
  throw Object.assign(new Error("Invalid Desktop command response"), {
    code: "DESKTOP_RESPONSE_INVALID",
  });
}
/** @param {unknown} value @param {number} maximum */
function pageBounded(value, maximum) {
  if (new TextEncoder().encode(JSON.stringify(value)).length > maximum)
    throw new Error("Invalid page tool size");
}
/** @param {unknown} value @param {string[]} keys @returns {value is Record<string,unknown>} */
function pageFields(value, keys) {
  return (
    record(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
/** @param {unknown} value */
function pageRevision(value) {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}
/** @param {unknown} value */
function pageOffset(value) {
  return pageRevision(value) && Number(value) <= 65536;
}
/** @param {unknown} value */
function validateMcpPageDeclaration(value) {
  if (
    !pageFields(value, ["version", "documentId", "tools"]) ||
    value.version !== 1 ||
    !identifier(value.documentId) ||
    value.documentId.length > 128 ||
    !Array.isArray(value.tools) ||
    value.tools.length < 1 ||
    value.tools.length > 2 ||
    new Set(value.tools).size !== value.tools.length ||
    value.tools.some((kind) => !["getSelection", "applyPatch"].includes(kind))
  )
    throw new Error("Invalid page tool declaration");
  pageBounded(value, 1024);
}
/** @param {unknown} value */
function validateMcpPageCall(value) {
  if (
    !pageFields(value, ["callId", "kind", "documentId", "arguments"]) ||
    !identifier(value.callId) ||
    !identifier(value.documentId)
  )
    throw new Error("Invalid page tool call");
  const args = value.arguments;
  if (value.kind === "getSelection" && pageFields(args, [])) return;
  if (
    value.kind !== "applyPatch" ||
    !pageFields(args, ["expectedDocumentRevision", "patch"]) ||
    !pageRevision(args.expectedDocumentRevision) ||
    !pageFields(args.patch, ["from", "to", "insert"]) ||
    !pageOffset(args.patch.from) ||
    !pageOffset(args.patch.to) ||
    Number(args.patch.from) > Number(args.patch.to) ||
    typeof args.patch.insert !== "string" ||
    args.patch.insert.length > 4096 ||
    args.patch.insert.includes("\r")
  )
    throw new Error("Invalid page tool arguments");
  pageBounded(args, 32768);
}
/** @param {unknown} value */
function validateMcpPageReply(value) {
  pageBounded(value, 32768);
  if (pageFields(value, ["status"]) && value.status === "unknown") return;
  if (
    pageFields(value, ["status", "reason"]) &&
    value.status === "noEffect" &&
    ["cancelled", "closed", "unavailable"].includes(String(value.reason))
  )
    return;
  if (
    !pageFields(value, ["status", "result"]) ||
    value.status !== "completed" ||
    !record(value.result)
  )
    throw new Error("Invalid page tool reply");
  const result = value.result;
  if (!identifier(result.documentId) || !pageRevision(result.documentRevision))
    throw new Error("Invalid page tool result");
  if (
    result.kind === "selection" &&
    pageFields(result, [
      "kind",
      "documentId",
      "documentRevision",
      "anchor",
      "head",
      "selectedText",
      "truncated",
      "dirty",
    ]) &&
    pageOffset(result.anchor) &&
    pageOffset(result.head) &&
    typeof result.selectedText === "string" &&
    result.selectedText.length <= 4096 &&
    typeof result.truncated === "boolean" &&
    typeof result.dirty === "boolean"
  )
    return;
  if (
    result.kind === "applied" &&
    pageFields(result, [
      "kind",
      "documentId",
      "previousDocumentRevision",
      "documentRevision",
      "from",
      "to",
      "insertedLength",
      "dirty",
    ]) &&
    pageRevision(result.previousDocumentRevision) &&
    pageOffset(result.from) &&
    pageOffset(result.to) &&
    pageOffset(result.insertedLength) &&
    Number(result.insertedLength) <= 4096 &&
    typeof result.dirty === "boolean"
  )
    return;
  if (
    result.kind === "conflict" &&
    pageFields(result, ["kind", "documentId", "expectedDocumentRevision", "documentRevision"]) &&
    pageRevision(result.expectedDocumentRevision)
  )
    return;
  if (
    result.kind === "rejected" &&
    pageFields(result, ["kind", "documentId", "documentRevision", "reason"]) &&
    ["invalidRange", "documentTooLarge", "noChange"].includes(String(result.reason))
  )
    return;
  throw new Error("Invalid page tool result");
}
module.exports = {
  commandDefinitions,
  commandSemantics,
  validateCommand,
  readCommandInvocation,
  validateCommandResponse,
  commandResponseError,
  /** @type {(request:unknown)=>asserts request is PreviewRequest} */
  validatePreview: validatePreview,
  desktopError,
  validateMcpPageDeclaration,
  validateMcpPageCall,
  validateMcpPageReply,
};
