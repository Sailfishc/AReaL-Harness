import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {appendFile, mkdtemp, mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {captureSmokeFailure, createProjectConversation, selectConversation} from './smoke-navigation.mjs';
import {assertApplicationStopped} from './application-cleanup.mjs';
import {pageToolsEditorHtml} from './fixtures/mcp-page-tools-bundle.mjs';

const gui = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(gui, '../..');
const require = createRequire(join(gui, 'app/package.json'));
const {_electron: electron} = require('playwright-core');
const baselineOnly = process.argv.includes('--inventory-baseline');
const contracts = [
  ['inventory', 'Ordinary inference receives both fixed kinds after initialized registration, with finite schemas and distinct instance names.'],
  ['isolation', 'A named tool edits its original live A page while B and another Thread remain unchanged, including when A is hidden.'],
  ['permission', 'Ordinary denied applyPatch creates no iframe request, no edit, and a durable failed or cancelled no-effect item.'],
  ['revision', 'Typing changes revision, selection does not, competing expected revisions admit one transaction, and real undo restores its text while advancing revision.'],
  ['bounds', 'Unknown arguments and oversized replacement fail before page dispatch; CR and surrogate-splitting patches leave document and revision unchanged.'],
  ['retention', 'Settings and pane hiding retain boot ID, document, selection, history, and the original tool publication.'],
  ['close-revoke', 'Explicit close removes publication and invalidates the token, reopen creates a new identity, and source revoke removes publication.'],
  ['cancel-no-effect', 'Cancellation confirmed before editor dispatch records cancelledNoEffect and leaves text unchanged.'],
  ['cancel-unknown', 'An editor transaction followed by a lost result records UNKNOWN, retains the one edit, and never replays.'],
  ['terminal-receipt', 'Identical terminal resubmission is accepted without execution and conflicting terminal data is rejected.'],
  ['socket-owner', 'Sibling Desktop and Core sockets cannot register, claim, or settle the opening owner’s instance.'],
];
const checkpoint = {blockingFirstSteps: 'Build pinned real CodeMirror fixture, then observe missing ordinary inventory using the immutable Phase 3 binary.', independentWorkstreams: 'This runner and its editor fixture are owned separately from Core and host implementation.', sharedMutableState: 'One isolated home/workspace per run; source GUI focus and fixed binary slots are serialized.', smallestSafeDecomposition: 'One runner owns the deterministic model plan, editor observation, and ordinary journal assertions.'};
const bundle = await pageToolsEditorHtml();
if (process.argv.includes('--bundle-only')) {
  console.log(JSON.stringify({bytes: bundle.bytes, versions: bundle.versions, contracts, checkpoint}, null, 2));
  process.exit(0);
}
const evidenceRoot = join(sourceRoot, '.scratch/phase-four');
await mkdir(evidenceRoot, {recursive: true});
const scratch = await mkdtemp(join(evidenceRoot, baselineOnly ? 'red-inventory-' : 'page-tools-'));
const isolated = await mkdtemp('/private/tmp/areal-page-tools-');
const workspace = join(isolated, 'workspace'), userHome = join(isolated, 'user');
await mkdir(join(workspace, '.agents/plugins'), {recursive: true});
await mkdir(join(userHome, '.areal'), {recursive: true});
execFileSync('git', ['init', '-b', 'main'], {cwd: workspace, stdio: 'ignore'});
const source = join(workspace, 'packages/editor'), transportLog = join(scratch, 'mcp.jsonl');
await mkdir(source, {recursive: true});
await writeFile(join(scratch, 'contract.json'), JSON.stringify({contracts, checkpoint, inputBoundary: 'Local deterministic model HTTP and native directory chooser are fixtures. Core, permission, journal, Desktop, Main, source-bound iframe, and CodeMirror are real.', faultBoundary: 'Explicit page pause before or after its synchronous real transaction. Result-loss injection is confined to the trusted Main return boundary.'}, null, 2));
await writeFile(join(source, 'plugin.json'), JSON.stringify({$schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'editor', version: '1.0.0', description: 'Real editor Page tool acceptance.', extensions: {'com.openai': {interface: {displayName: 'Page tools fixture'}}}}));
await writeFile(join(source, 'app.html'), bundle.html);
await writeFile(join(source, 'server.mjs'), String.raw`import {createInterface} from 'node:readline';
import {appendFileSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
const tools=['A','B'].map(label=>({name:'fixture.page'+label,title:'Editor '+label,description:'Open static editor '+label,inputSchema:{type:'object',additionalProperties:false},annotations:{readOnlyHint:true},_meta:{ui:{resourceUri:'ui://fixture/editor',visibility:['model']},'openai/ui':{entrypoints:[{type:'global'},{type:'thread'}]}}}));
for await(const line of createInterface({input:process.stdin})){let q;try{q=JSON.parse(line);appendFileSync(process.env.FIXTURE_LOG,JSON.stringify(q)+'\n');if(q.id===undefined)continue;let result;
switch(q.method){
case'initialize':result={protocolVersion:q.params.protocolVersion,serverInfo:{name:'static-editor-fixture',version:'1'},capabilities:{tools:{},resources:{},extensions:{'io.modelcontextprotocol/ui':{}}}};break;
case'ping':result={};break;
case'tools/list':result={tools};break;
case'resources/list':result={resources:[{uri:'ui://fixture/editor',name:'Static real editor',mimeType:'text/html;profile=mcp-app'}]};break;
case'resources/templates/list':result={resourceTemplates:[]};break;
case'resources/read':result={contents:[{uri:q.params.uri,mimeType:'text/html;profile=mcp-app',text:readFileSync(fileURLToPath(new URL('./app.html',import.meta.url)),'utf8'),_meta:{ui:{csp:{connectDomains:[],resourceDomains:[]}}}}]};break;
case'tools/call':if(!tools.some(tool=>tool.name===q.params.name))throw Error('static fixture cannot execute editor operations');result={content:[{type:'text',text:'STATIC_EDITOR_OPEN_'+q.params.name}]};break;
default:throw Error('unsupported static fixture method '+q.method);}
send({jsonrpc:'2.0',id:q.id,result});}catch(error){if(q?.id!==undefined)send({jsonrpc:'2.0',id:q.id,error:{code:-32602,message:error.message}});}}
`);
await writeFile(join(source, 'mcp.json'), JSON.stringify({$schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', mcpServers: {fixture: {type: 'stdio', command: 'node', args: ['${PLUGIN_ROOT}/server.mjs'], env: {FIXTURE_LOG: transportLog}}}}));
await writeFile(join(workspace, '.agents/plugins/marketplace.json'), JSON.stringify({name: 'page-tools-market', plugins: [{name: 'editor', source: {source: 'local', path: './packages/editor'}, policy: {installation: 'AVAILABLE', authentication: 'ON_USE'}, category: 'Productivity'}]}));
const sourceFiles = {};
for (const path of new Set(execFileSync('git', ['ls-files', '--modified', '--others', '--exclude-standard', '-z'], {cwd: sourceRoot}).toString().split('\0').filter(Boolean))) {
  if (/^(core\/|clients\/|scripts\/|schemas\/|Cargo\.)/.test(path)) sourceFiles[path] = createHash('sha256').update(await readFile(join(sourceRoot, path))).digest('hex');
}
const sourceDiffSha256 = createHash('sha256').update(execFileSync('git', ['diff', '--binary', 'HEAD'], {cwd: sourceRoot})).digest('hex');
const requests = [], checks = [], errors = [], plans = new Map();
let modelFailure;
const contentText = content => typeof content === 'string' ? content : Array.isArray(content) ? content.map(value => value.text ?? '').join('\n') : '';
const model = createServer(async (req, res) => {
  try {
    let body = ''; for await (const part of req) body += part;
    const request = JSON.parse(body);
    requests.push(request);
    await appendFile(join(scratch, 'model-requests.jsonl'), JSON.stringify(request) + '\n');
    const marker = [...(request.messages ?? [])].reverse().map(message => message.role === 'user' ? contentText(message.content) : '').find(text => text.startsWith('PAGE_CASE '));
    const plan = marker ? plans.get(marker.split(' ')[1]) : undefined;
    let delta = {content: 'PAGE_CASE_DONE'};
    let finish = 'stop';
    if (plan && !plan.sent) {
      plan.inventory = request.tools ?? [];
      plan.sent = true;
      plan.validate?.(plan.inventory);
      if (plan.calls?.length) {
        delta = {tool_calls: plan.calls.map((call, index) => ({index, id: call.id, type: 'function', function: {name: call.name, arguments: JSON.stringify(call.arguments)}}))};
        finish = 'tool_calls';
      }
    }
    res.writeHead(200, {'Content-Type': 'text/event-stream'});
    res.end('data: ' + JSON.stringify({choices: [{index: 0, delta, finish_reason: null}]}) + '\n\n' + 'data: ' + JSON.stringify({choices: [{index: 0, delta: {}, finish_reason: finish}]}) + '\n\ndata: [DONE]\n\n');
  } catch (error) {
    modelFailure = error;
    await appendFile(join(scratch, 'model-errors.jsonl'), JSON.stringify({message: error.message, stack: error.stack}) + '\n');
    if (!res.headersSent) res.writeHead(500, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: {message: error.message}}));
  }
});
await new Promise(resolve => model.listen(0, '127.0.0.1', resolve));
await writeFile(join(userHome, '.areal/config.toml'), `schema_version=1\n[model]\nname="fixture"\n[model.providers.default]\nprotocol="chat-completions"\nendpoint="http://127.0.0.1:${model.address().port}"\n`);
const env = {...process.env, AREAL_GUI_USER_DATA: join(isolated, 'electron'), AREAL_CORE_HOME: join(isolated, 'core'), AREAL_CORE_USER_HOME: userHome, AREAL_HARNESS_SERVICE_HOME: join(isolated, 'registry'), AREAL_CORE_BIN: process.env.AREAL_CORE_BIN ?? resolve(gui, '../../target/debug/areal')};
for (const key of ['AREAL_CORE_WORKSPACE', 'AREAL_CORE_CONFIG', 'AREAL_HARNESS_HOME', 'AREAL_HARNESS_CONFIG', 'AREAL_CORE_DESKTOP_CONFIG']) delete env[key];
const coreBinary = env.AREAL_CORE_BIN;
const coreBuildInfo = JSON.parse(execFileSync(coreBinary, ['build-info'], {encoding: 'utf8'}));
const coreSha256 = createHash('sha256').update(await readFile(coreBinary)).digest('hex');
const fixtureApp = join(isolated, 'app'), mainErrorsPath = join(scratch, 'main-errors.jsonl');
await mkdir(fixtureApp);
await writeFile(mainErrorsPath, '');
await writeFile(join(fixtureApp, 'package.json'), JSON.stringify({name: 'mcp-page-tools-fixture', main: 'bootstrap.cjs'}));
await writeFile(join(fixtureApp, 'bootstrap.cjs'), `process.on('uncaughtExceptionMonitor',(error,origin)=>require('node:fs').appendFileSync(${JSON.stringify(mainErrorsPath)},JSON.stringify({pid:process.pid,origin,message:error.message,stack:error.stack})+'\\n'));require(${JSON.stringify(join(gui, 'app/src/main.cjs'))});`);
const {builtinSkill, BUILTIN_SKILL_ID} = require('../app/src/core/builtin-skills.cjs');
await builtinSkill(join(isolated, 'core'), BUILTIN_SKILL_ID);
let app, page, appProcess, failure, passed = false;
const button = name => page.getByRole('button', {name, exact: true});
const state = () => page.evaluate(() => window.arealDesktop.snapshot());
async function eventually(read, predicate, label, timeout = 30000) {
  const end = Date.now() + timeout;
  let value;
  do {
    if (modelFailure) throw modelFailure;
    value = await read();
    if (predicate(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 75));
  } while (Date.now() < end);
  throw Error(`Timeout ${label}. Last observation ${JSON.stringify(value).slice(0, 4096)}`);
}
async function transportEvents() {try {return (await readFile(transportLog, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));} catch (error) {if (error.code === 'ENOENT') return []; throw error;}}
const selected = () => page.getByTestId('areal-workbench').evaluate(el => ({projectId: el.dataset.projectId, threadId: el.dataset.threadId}));
const fixture = frame => frame.evaluate(() => window.fixture.snapshot());
async function appFrame(token) {
  const frame = await eventually(async () => page.frames().find(frame => token ? frame.url() === `areal-mcp://${token}/view` : /^areal-mcp:\/\/[^/]+\/view$/.test(frame.url())), Boolean, 'source-bound editor iframe');
  await frame.locator('#ready').filter({hasText: 'initialized'}).waitFor({state: 'attached'});
  return frame;
}
async function settings() {
  await page.getByRole('navigation', {name: '应用导航', exact: true}).getByRole('button', {name: '插件', exact: true}).click();
  const installed = page.getByRole('complementary', {name: '插件导航', exact: true}).getByRole('button', {name: 'Page tools fixture', exact: true});
  if (await installed.isVisible()) {await installed.click(); return;}
  if (await button('返回插件列表').isVisible()) await button('返回插件列表').click();
  await page.getByRole('tablist', {name: '市场范围', exact: true}).getByRole('tab', {name: '个人', exact: true}).click();
  await button('查看插件 editor@page-tools-market').click();
}
async function openPage(label) {
  await settings();
  await button(`Editor ${label}`).first().click();
  const iframe = page.getByRole('region', {name: 'MCP 应用', exact: true}).locator(`iframe[title="Editor ${label}"]`);
  await iframe.waitFor();
  return appFrame(new URL(await iframe.getAttribute('src')).hostname);
}
async function openThreadPage(label, owner) {
  await selectOwner(owner.threadId);
  await button(`Editor ${label}`).click();
  const iframe = page.getByRole('region', {name: 'MCP 应用', exact: true}).locator(`iframe[title="Editor ${label}"]`);
  await iframe.waitFor();
  assert.deepEqual(await selected(), owner, 'Thread entrypoint preserves the selected owner');
  return appFrame(new URL(await iframe.getAttribute('src')).hostname);
}
async function selectOwner(threadId) {
  if (await button('返回应用').isVisible()) await button('返回应用').click();
  await page.getByRole('navigation', {name: '应用导航', exact: true}).getByRole('button', {name: '首页', exact: true}).click();
  if (await button('展开侧栏').isVisible()) await button('展开侧栏').click();
  await selectConversation(page, threadId);
}
const thread = (snapshot, owner) => snapshot.projects.find(project => project.id === owner.projectId)?.state?.threads?.[owner.threadId];
async function beginCase(name, calls = [], validate) {
  const id = randomUUID(), owner = await selected();
  const plan = {id, name, owner, calls: calls.map((call, index) => ({...call, id: `page-${id}-${index}`})), validate, sent: false};
  plans.set(id, plan);
  await page.getByTestId('chat-input').fill(`PAGE_CASE ${id} ${name}`);
  await page.getByTestId('chat-send-button').click();
  await eventually(async () => plan.sent, value => value, `ordinary model received ${name}`);
  return plan;
}
async function finishCase(plan, statuses = ['completed']) {
  const snapshot = await eventually(state, snapshot => thread(snapshot, plan.owner)?.turns?.some(turn => statuses.includes(turn.status) && (plan.calls.length ? plan.calls.every(call => turn.items?.some(item => item.callId === call.id)) : JSON.stringify(turn).includes(plan.id))), `ordinary turn ${plan.name} settled`);
  const ownerThread = thread(snapshot, plan.owner);
  const turn = ownerThread.turns.find(turn => plan.calls.length ? plan.calls.every(call => turn.items?.some(item => item.callId === call.id)) : JSON.stringify(turn).includes(plan.id));
  assert(turn, `persisted ordinary Turn for ${plan.name}`);
  plan.turnId = turn.id;
  plan.items = plan.calls.map(call => {const item = turn.items.find(item => item.callId === call.id); assert.equal(item.type, 'dynamicToolCall'); return item;});
  await writeFile(join(scratch, `${plan.name}.json`), JSON.stringify({owner: plan.owner, turn, inventory: plan.inventory}, null, 2));
  return plan.items;
}
async function registration(token) {
  return eventually(async () => app.evaluate(token => global.pageToolsReceipts.find(receipt => receipt.request.operation === 'pageToolsReady' && receipt.request.token === token && receipt.reply?.registrationId), token), Boolean, 'trusted initialized registration');
}
const toolName = (receipt, kind) => {const tool = receipt.reply.tools.find(tool => tool.kind === kind); assert(tool, `registered ${kind}`); return tool.name;};
const pageEvidence = item => {
  const evidence = item.execution?.page;
  assert(evidence, 'ordinary ToolExecution contains frozen Page evidence');
  assert.equal(evidence.dispatch.state, 'terminal');
  assert.match(evidence.binding.schemaDigest, /^[0-9a-f]{64}$/);
  assert.match(evidence.dispatch.replyDigest, /^[0-9a-f]{64}$/);
  return evidence;
};
async function setPermission(label) {
  await button('更改权限').click();
  await page.getByRole('menuitemradio').filter({hasText: label}).click();
  await eventually(state, snapshot => {
    const owner = plans.size ? [...plans.values()].at(-1).owner : null;
    const options = snapshot.projects.find(project => project.id === owner?.projectId)?.configurations?.[owner.threadId]?.options;
    return options && (label === '请求审批' ? options.approvalTools?.includes('*') : !options.approvalTools?.length);
  }, `permission ${label} persisted`);
}
async function setFault(mode) {await app.evaluate((_electron, mode) => {global.pageToolFault = {mode, reached: false};}, mode);}
async function waitFault() {return eventually(async () => app.evaluate(() => ({mode: global.pageToolFault?.mode, reached: global.pageToolFault?.reached, request: global.pageToolFault?.request, reply: global.pageToolFault?.reply})), value => value.reached, 'declared transport fault boundary');}
async function releaseFault() {await app.evaluate(() => {global.pageToolFault?.release?.(); global.pageToolFault = null;});}
async function stopTurn() {await button('暂停执行').click();}
const terminalStatuses = ['completed', 'interrupted', 'failed'];
try {
  app = await electron.launch({executablePath: require('electron'), args: [fixtureApp], env, timeout: 120000});
  page = await app.firstWindow(); appProcess = app.process(); page.setDefaultTimeout(20000);
  console.log(`Electron ${appProcess.pid}. Evidence ${scratch}`);
  await writeFile(join(scratch, 'run.json'), JSON.stringify({pid: appProcess.pid, isolated, scratch, coreBinary, env: {AREAL_CORE_HOME: env.AREAL_CORE_HOME, AREAL_GUI_USER_DATA: env.AREAL_GUI_USER_DATA}}, null, 2));
  page.on('pageerror', error => errors.push(error.message));
  await page.getByTestId('areal-workbench').waitFor({timeout: 120000});
  await eventually(state, snapshot => snapshot.connection?.state === 'ready', 'Desktop ready');
  await app.evaluate(({dialog, BrowserWindow}, path) => {dialog.showOpenDialog = async () => ({canceled: false, filePaths: [path]}); dialog.showMessageBox = async () => ({response: 1}); BrowserWindow.getAllWindows()[0].setSize(1440, 960);}, workspace);
  const identity = await app.evaluate(({app, BrowserWindow}) => ({pid: process.pid, electron: process.versions.electron, userData: app.getPath('userData'), windows: BrowserWindow.getAllWindows().map(window => window.webContents.getLastWebPreferences())}));
  assert.equal(identity.userData, env.AREAL_GUI_USER_DATA);
  for (const preferences of identity.windows) {assert.equal(preferences.contextIsolation, true); assert.equal(preferences.nodeIntegration, false);}
  await writeFile(join(scratch, 'doctor.json'), JSON.stringify(identity, null, 2));
  await app.evaluate(({ipcMain}, serviceModule) => {
    global.pageToolsReceipts = [];
    global.pageToolRequests = [];
    const {ServiceConnection} = require(serviceModule), originalRequest = ServiceConnection.prototype.request;
    ServiceConnection.prototype.request = async function(method, params, mutation) {
      if (method !== 'mcpPageTools') return originalRequest.call(this, method, params, mutation);
      global.pageToolConnection = this;
      const record = {params: structuredClone(params)};
      global.pageToolRequests.push(record);
      const fault = global.pageToolFault;
      const hold = async reply => {
        fault.reached = true; fault.request = structuredClone(params); fault.reply = reply;
        await new Promise(resolve => {fault.release = resolve;});
      };
      if (fault?.mode === 'beforeClaim' && params.operation === 'claim') await hold(null);
      const reply = await originalRequest.call(this, method, params, mutation);
      record.reply = structuredClone(reply);
      if (fault?.mode === 'afterClaim' && params.operation === 'claim' && reply.status === 'granted') await hold(reply);
      if (fault?.mode === 'afterResolve' && params.operation === 'resolve') {
        await hold(reply);
        throw Object.assign(Error('Injected lost response after real durable resolve'), {submissionUnknown: true});
      }
      return reply;
    };
    const channel = 'areal-core:mcp-app', original = ipcMain._invokeHandlers.get(channel);
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, async (event, request) => {
      const reply = await original(event, request);
      global.pageToolsReceipts.push({request, reply});
      return reply;
    });
  }, join(gui, 'app/src/core/service-client.cjs'));
  await page.evaluate(() => window.arealDesktop.chooseProject());
  await createProjectConversation(page, 'workspace');
  await eventually(state, snapshot => snapshot.projects.find(project => project.root === workspace)?.state?.connected, 'project connected');
  await settings(); await button('核对来源并安装').click();
  await page.getByRole('checkbox', {name: '我已核对以上来源、版本和内容摘要', exact: true}).check();
  await button('安装到用户').click(); await button('审阅并连接').click();
  await page.getByRole('checkbox', {name: '我信任当前安装快照，并允许启动其 MCP 服务。', exact: true}).check();
  await button('信任并连接').click();
  await eventually(transportEvents, events => events.some(event => event.method === 'tools/list'), 'static MCP transport');
  const a = await openPage('A'), tokenA = new URL(a.url()).hostname, ownerA = await selected();
  const initialA = await fixture(a);
  assert.deepEqual({text: initialA.text, documentRevision: initialA.documentRevision, undoDepth: initialA.undoDepth, dirty: initialA.dirty}, {text: 'alpha beta\nsecond line\n', documentRevision: 0, undoDepth: 0, dirty: false});
  let readyA;
  if (!baselineOnly) readyA = await registration(tokenA);
  await selectOwner(ownerA.threadId);
  const inventory = await beginCase('inventory', [], tools => {
    const pageTools = tools.filter(tool => /^app_/.test(tool.function?.name ?? ''));
    assert.equal(pageTools.length, 2, 'ordinary model inventory must contain both live Page tools; Phase 3 has no page-tool capability');
    for (const tool of pageTools) {assert.equal(tool.function.parameters.type, 'object'); assert.equal(tool.function.parameters.additionalProperties, false);}
  });
  await finishCase(inventory);
  checks.push('inventory');
  if (baselineOnly) assert.fail('Phase 3 unexpectedly has Page tools; baseline no longer represents missing capability');
  const b = await openThreadPage('B', ownerA), tokenB = new URL(b.url()).hostname;
  const readyB = await registration(tokenB), initialB = await fixture(b);
  assert.notEqual(initialA.documentId, initialB.documentId);
  assert.notEqual(toolName(readyA, 'applyPatch'), toolName(readyB, 'applyPatch'));
  await page.getByRole('tab', {name: 'Editor A', exact: true}).click();
  await a.getByRole('button', {name: 'Select first word', exact: true}).click();
  assert.equal((await fixture(a)).documentRevision, 0, 'selection-only real transaction keeps revision');
  await selectOwner(ownerA.threadId);
  await page.getByRole('tab', {name: 'Editor B', exact: true}).click();
  const selection = await beginCase('selection', [{name: toolName(readyA, 'getSelection'), arguments: {}}]);
  const [selectionItem] = await finishCase(selection);
  assert.equal(selectionItem.success, true); assert.equal(selectionItem.execution.outcome, 'succeeded');
  assert.deepEqual((await fixture(a)).calls.at(-1).reply, {status: 'completed', result: {kind: 'selection', documentId: initialA.documentId, documentRevision: 0, anchor: 0, head: 5, selectedText: 'alpha', truncated: false, dirty: false}});
  pageEvidence(selectionItem);
  const patch = await beginCase('target-a', [{name: toolName(readyA, 'applyPatch'), arguments: {expectedDocumentRevision: 0, patch: {from: 0, to: 5, insert: 'ALPHA'}}}]);
  const [patched] = await finishCase(patch);
  assert.equal(patched.success, true); assert.equal(patched.execution.outcome, 'succeeded'); pageEvidence(patched);
  assert.equal((await fixture(a)).text, 'ALPHA beta\nsecond line\n'); assert.equal((await fixture(a)).documentRevision, 1);
  assert.deepEqual(await fixture(b), initialB, 'named page A call leaves identical page B untouched');
  checks.push('isolation');
  const beforeHidden = await fixture(a);
  await button('设置').click(); await page.getByRole('navigation', {name: '设置导航', exact: true}).waitFor();
  assert.deepEqual(await fixture(a), beforeHidden);
  await selectOwner(ownerA.threadId);
  const hidden = await beginCase('hidden-read', [{name: toolName(readyA, 'getSelection'), arguments: {}}]);
  await finishCase(hidden);
  assert.equal((await fixture(a)).bootId, initialA.bootId);
  assert.equal((await fixture(a)).text, beforeHidden.text); assert.equal((await fixture(a)).undoDepth, beforeHidden.undoDepth);
  checks.push('retention');
  await createProjectConversation(page, 'workspace');
  const otherOwner = await selected();
  const other = await beginCase('other-thread', [], tools => assert(!tools.some(tool => [toolName(readyA, 'applyPatch'), toolName(readyB, 'getSelection')].includes(tool.function?.name)), 'other Thread must not see A/B publication'));
  await finishCase(other);
  assert.notEqual(otherOwner.threadId, ownerA.threadId); assert.equal((await fixture(a)).text, beforeHidden.text);
  await selectOwner(ownerA.threadId);
  const activeA = page.locator(`[data-app-token="${tokenA}"]`);
  if (!await activeA.isVisible()) {if (await button('展开侧边面板').isVisible()) await button('展开侧边面板').click(); await page.getByRole('tab', {name: 'Editor A', exact: true}).click();}
  const editor = a.getByRole('textbox', {name: 'Unsaved CodeMirror document', exact: true});
  await editor.click(); await editor.press('Control+End'); await editor.press('End'); await editor.type('typed');
  const typed = await fixture(a);
  assert.equal(typed.text, 'ALPHA beta\nsecond line\ntyped'); assert(typed.documentRevision > 1);
  await a.getByRole('button', {name: 'Select first word', exact: true}).click();
  assert.equal((await fixture(a)).documentRevision, typed.documentRevision);
  await selectOwner(ownerA.threadId);
  const competing = await beginCase('revision-competition', [
    {name: toolName(readyA, 'applyPatch'), arguments: {expectedDocumentRevision: typed.documentRevision, patch: {from: 0, to: 5, insert: 'winner'}}},
    {name: toolName(readyA, 'applyPatch'), arguments: {expectedDocumentRevision: typed.documentRevision, patch: {from: 0, to: 5, insert: 'loser'}}},
  ]);
  const competingItems = await finishCase(competing);
  assert.deepEqual(competingItems.map(item => item.success).sort(), [false, true]);
  const competed = await fixture(a);
  assert.equal(competed.documentRevision, typed.documentRevision + 1);
  assert.match(competed.text, /^(winner|loser) beta\nsecond line\ntyped$/);
  const lastReplies = competed.calls.slice(-2).map(call => call.reply.result.kind).sort();
  assert.deepEqual(lastReplies, ['applied', 'conflict']);
  await a.getByRole('button', {name: 'Undo', exact: true}).click();
  const undone = await fixture(a);
  assert.equal(undone.text, typed.text); assert.equal(undone.documentRevision, competed.documentRevision + 1);
  await a.getByRole('button', {name: 'Redo', exact: true}).click();
  assert.equal((await fixture(a)).text, competed.text); assert.equal((await fixture(a)).documentRevision, undone.documentRevision + 1);
  checks.push('revision');
  await writeFile(join(scratch, 'editor-identities.json'), JSON.stringify({ownerA, tokenA, tokenB, readyA, readyB, initialA, initialB, typed, competed, undone}, null, 2));
  await page.screenshot({path: join(scratch, 'real-editor.png'), animations: 'disabled'});
  const staticEvents = await transportEvents();
  assert(staticEvents.filter(event => event.method === 'tools/call').every(event => ['fixture.pageA', 'fixture.pageB'].includes(event.params.name)), 'static MCP fixture never reads or mutates live editor');
  assert.deepEqual(errors, []);
  passed = true;
} catch (error) {
  failure = {message: error.message, stack: error.stack}; process.exitCode = 1; console.error(error);
  if (page) {await captureSmokeFailure(page, scratch, error); await writeFile(join(scratch, 'failure-snapshot.json'), JSON.stringify(await state().catch(() => null), null, 2));}
} finally {
  const cleanup = {};
  let metadata;
  try {metadata = JSON.parse(await readFile(join(isolated, 'core/service.json'), 'utf8'));} catch (error) {if (error.code !== 'ENOENT') errors.push('cleanup identity ' + error.message);}
  if (app) {
    let quitTimer;
    try {
      await Promise.race([app.close(), new Promise((_resolve, reject) => {quitTimer = setTimeout(() => reject(Error('owned Electron quit timed out')), 15000);})]);
      if (appProcess.exitCode === null && appProcess.signalCode === null) await new Promise((resolve, reject) => {const timer = setTimeout(() => reject(Error('owned Electron did not exit')), 15000); appProcess.once('exit', () => {clearTimeout(timer); resolve();});});
      assert.equal(appProcess.exitCode, 0); assert.equal(appProcess.signalCode, null); cleanup.electronExited = true;
    } catch (error) {errors.push('close GUI ' + error.message);} finally {clearTimeout(quitTimer);}
  }
  if (metadata) {
    try {await assertApplicationStopped(coreBinary, env, metadata); cleanup.applicationStopped = true;}
    catch (error) {errors.push('verify application cleanup ' + error.message);}
  }
  if (metadata && !cleanup.applicationStopped) {
    cleanup.assistedServiceStop = true;
    const {ServiceConnection, waitForServiceProcessExit} = require('../app/src/core/service-client.cjs'), connection = new ServiceConnection();
    try {
      await connection.connect(metadata); const packet = await connection.request('hello', {protocol: metadata.protocol, identity: metadata.identity});
      try {await connection.request('stopService', {protocol: metadata.protocol, cancel: true, expectedDesktopGeneration: metadata.desktopGeneration, expectedTargets: packet.service.targets}, true);} catch (error) {if (!error.message.includes('已请求退出')) throw error;}
      await waitForServiceProcessExit(join(isolated, 'core'), metadata); cleanup.desktopExited = true;
    } catch (error) {if (!['ENOENT', 'ECONNREFUSED', 'ESRCH'].includes(error.code)) errors.push('fallback stop service ' + error.message);} finally {connection.close();}
  }
  if (appProcess && appProcess.exitCode === null && appProcess.signalCode === null) {errors.push('forced Electron cleanup'); appProcess.kill('SIGKILL'); await new Promise(resolve => appProcess.once('exit', resolve)); cleanup.forcedElectronExit = true;}
  const mainErrors = (await readFile(mainErrorsPath, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  for (const error of mainErrors) errors.push('uncaught Main ' + error.origin + ' ' + error.message);
  try {cleanup.instances = JSON.parse(execFileSync(coreBinary, ['service', 'list', '--json'], {env, encoding: 'utf8'})); assert(cleanup.instances.every(instance => instance.state === 'stopped'), 'owned Core instance remains live'); cleanup.coreStopped = true;} catch (error) {errors.push('verify owned Core cleanup ' + error.message);}
  model.closeAllConnections(); await new Promise(resolve => model.close(resolve));
  if (errors.length) {passed = false; process.exitCode = 1;}
  const remaining = contracts.filter(([name]) => !checks.includes(name)).map(([name]) => name);
  if (passed && remaining.length) {passed = false; process.exitCode = 1; failure = {message: 'Required contract scenarios have not run: ' + remaining.join(', ')};}
  const manifest = {passed, baselineOnly, checks, remaining, failure, errors, mainErrors, scratch, isolated, cleanup, source: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: sourceRoot, encoding: 'utf8'}).trim(), sourceFiles, sourceDiffSha256, core: {buildInfo: coreBuildInfo, binary: coreBinary, sha256: coreSha256, unchanged: createHash('sha256').update(await readFile(coreBinary)).digest('hex') === coreSha256}, editor: {versions: bundle.versions, inlineResourceBytes: bundle.bytes}, modelRequests: requests.length, transportEvents: await transportEvents(), scope: 'Real source Electron, Desktop, Core, ordinary local model tool inventory and calls, source-bound iframe and pinned CodeMirror. Native chooser and deterministic local model are fixture boundaries.', gaps: ['No real provider or packaged acceptance', ...remaining.map(name => 'Not yet executed ' + name)]};
  await writeFile(join(scratch, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('Evidence: ' + scratch); console.log(JSON.stringify({passed, baselineOnly, checks, remaining, failure, errors, cleanup, core: manifest.core}, null, 2));
}
