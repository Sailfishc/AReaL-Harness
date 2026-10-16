import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { appendFileSync } from 'node:fs';
import { chmod, copyFile, lstat, mkdtemp, mkdir, readFile, readdir, realpath, rename, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const script = fileURLToPath(import.meta.url);
const gui = resolve(dirname(script), '..');
const root = resolve(gui, '../..');
const require = createRequire(join(gui, 'app/package.json'));
const { _electron: electron } = require('playwright-core');
const { ServiceConnection } = require('../app/src/core/service-client.cjs');
const { DesktopLifecycle } = require('../app/src/core/lifecycle.cjs');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
assert.ok(process.env.AREAL_CORE_BIN && isAbsolute(process.env.AREAL_CORE_BIN), 'AREAL_CORE_BIN must name a private absolute fixed slot');
const binary = resolve(process.env.AREAL_CORE_BIN);
const slots = join(root, '.local/dev-bin');
const slot = relative(slots, dirname(binary));
assert.ok(slot && slot !== '..' && !slot.startsWith(`..${sep}`) && !isAbsolute(slot), 'use .local/dev-bin/<task-slot>/areal, never the shared root or target binary');
assert.equal(basename(binary), 'areal');
assert.equal(await realpath(binary), binary, 'the private Core path must not traverse symlinks');
const originalStat = await lstat(binary);
assert.ok(originalStat.isFile() && originalStat.nlink === 1, 'Core must be a regular private copy, not a hard link');
const binarySha256 = sha(await readFile(binary));
const legacy = process.env.AREAL_REOPEN_LEGACY === '1';
const replacement = process.env.AREAL_REOPEN_REPLACEMENT_BIN;
assert.ok(!(legacy && replacement), 'run binary replacement and legacy-source migration separately');
const scenario = legacy ? 'legacy' : replacement ? 'replacement' : 'mtime';
let replacementSha256, replacementFormat;
if (replacement) {
  assert.ok(isAbsolute(replacement), 'AREAL_REOPEN_REPLACEMENT_BIN must be an absolute path');
  assert.notEqual(await realpath(replacement), binary, 'replacement must be another real binary');
  assert.ok((await lstat(replacement)).isFile(), 'replacement must be a regular binary file');
  replacementFormat = execFileSync('file', ['-b', replacement], { encoding: 'utf8' }).trim();
  assert.match(replacementFormat, /Mach-O.*executable/, 'replacement must be an actual Mach-O executable');
  replacementSha256 = sha(await readFile(replacement));
  assert.notEqual(replacementSha256, binarySha256, 'replacement must have different executable contents');
}
const components = Object.fromEntries(await Promise.all(['areal', 'areal-runtime', 'areal-runtime-fs'].map(async name =>
  [name, sha(await readFile(join(dirname(binary), name)))])));
const source = {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  dirty: execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' }).trim(),
  diffSha256: sha(execFileSync('git', ['diff', '--binary', 'HEAD'], { cwd: root, maxBuffer: 32 * 1024 * 1024 })),
  scriptSha256: sha(await readFile(script)),
  rendererIndexSha256: sha(await readFile(join(gui, 'renderer/dist/index.html'))),
};
const scratch = await mkdtemp('/private/tmp/areal-service-reopen-');
const binaryBackup = replacement ? join(dirname(binary), `.reopen-original-${basename(scratch)}`) : null;
const binaryStage = join(dirname(binary), `.reopen-stage-${basename(scratch)}`);
const home = join(scratch, 'core'), workspace = join(scratch, 'workspace'), registry = join(scratch, 'registry');
const observations = {}, checks = [], errors = [], requests = [], held = new Set();
const cleanup = { guiClosed: false, serviceStopped: false, binaryContentsRestored: false, binaryTimestampRestored: false };
let app, page, projectId, threadId, turnId, passed = false, phase = 'setup';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async (predicate, label, timeout = 60000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await sleep(100);
  }
  throw new Error(`Timeout: ${label}`);
};
const alive = pid => {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
};
const state = () => page.evaluate(() => window.arealDesktop.snapshot());
const project = snapshot => snapshot.projects.find(value => value.id === projectId);
const turn = snapshot => project(snapshot)?.state?.threads[threadId]?.turns.at(-1);
const send = (response, content) => response.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`);
const model = createServer(async (request, response) => {
  try {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    requests.push(JSON.parse(raw));
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    send(response, 'REOPEN_HELD');
    held.add(response);
    response.on('close', () => held.delete(response));
  } catch (error) { errors.push(`model fixture: ${error.stack}`); response.destroy(error); }
});
await mkdir(workspace);
await mkdir(join(scratch, 'user/.areal'), { recursive: true });
execFileSync('git', ['init', '-b', 'main'], { cwd: workspace, stdio: 'ignore' });
await new Promise(resolve => model.listen(0, '127.0.0.1', resolve));
const config = join(scratch, 'config.toml');
await writeFile(config, `schema_version=1\n[model]\nprovider="fixture"\nname="fixture"\n[model.providers.fixture]\nprotocol="chat-completions"\nendpoint="http://127.0.0.1:${model.address().port}/v1/chat/completions"\n`);
const env = { ...process.env, AREAL_CORE_BIN: binary, AREAL_CORE_CONFIG: config, AREAL_CORE_HOME: home,
  AREAL_GUI_USER_DATA: join(scratch, 'electron'), AREAL_CORE_USER_HOME: join(scratch, 'user'),
  AREAL_HARNESS_SERVICE_HOME: registry };
for (const key of ['AREAL_CORE_WORKSPACE', 'AREAL_HARNESS_HOME', 'AREAL_HARNESS_CONFIG', 'AREAL_CORE_DESKTOP_CONFIG',
  'AREAL_HARNESS_TOOL_EXTENSIONS', 'AREAL_CORE_SANDBOX_PROFILE', 'AREAL_CORE_WORKGROUP_POLICY', 'AREAL_CORE_WORKGROUP_TOOLCHAIN']) delete env[key];
const testApp = join(scratch, 'app');
const currentMain = join(gui, 'app/src/main.cjs');
let initialMain = currentMain;
if (legacy) {
  const legacyRoot = join(scratch, 'legacy-source');
  const archive = join(scratch, 'legacy-app.tar');
  const commit = execFileSync('git', ['rev-parse', 'ed43b272'], { cwd: root, encoding: 'utf8' }).trim();
  await mkdir(legacyRoot);
  execFileSync('git', ['archive', '--format=tar', '--output', archive, commit, 'clients/gui/app'], { cwd: root });
  execFileSync('tar', ['-xf', archive, '-C', legacyRoot]);
  const legacyGui = join(legacyRoot, 'clients/gui');
  await symlink(join(gui, 'app/node_modules'), join(legacyGui, 'app/node_modules'), 'dir');
  await symlink(join(gui, 'renderer'), join(legacyGui, 'renderer'), 'dir');
  initialMain = join(legacyGui, 'app/src/main.cjs');
  source.legacy = { commit, main: initialMain, archiveSha256: sha(await readFile(archive)),
    serviceConfigSha256: sha(await readFile(join(legacyGui, 'app/src/core/service-config.cjs'))) };
}
await mkdir(testApp);
await writeFile(join(testApp, 'package.json'), JSON.stringify({ name: 'areal-service-reopen-fixture', main: 'bootstrap.cjs' }));
await writeFile(join(testApp, 'bootstrap.cjs'), `
const { dialog } = require('electron');
const { appendFileSync } = require('node:fs');
globalThis.__reopenDialogs = [];
dialog.showMessageBox = async (...args) => {
  const options = args.at(-1);
  const reuse = process.env.AREAL_REOPEN_LEGACY === '1' && process.env.AREAL_REOPEN_PHASE === 'reopened'
    && globalThis.__reopenDialogs.length === 0
    && ['后台暂时无法重启', '需要重启后台服务'].includes(options.message)
    && options.buttons?.includes('继续使用原后台');
  const response = reuse ? options.buttons.indexOf('继续使用原后台') : (options.cancelId ?? 0);
  const entry = { phase: process.env.AREAL_REOPEN_PHASE, ...options, response, selectedButton: options.buttons?.[response] };
  globalThis.__reopenDialogs.push(entry);
  appendFileSync(${JSON.stringify(join(scratch, 'dialogs.jsonl'))}, JSON.stringify(entry) + '\\n');
  return { response };
};
require(process.env.AREAL_REOPEN_MAIN);
`);
const dialogs = async () => app.evaluate(() => globalThis.__reopenDialogs);
function checkDialogs(seen, label, ready = false) {
  if (!legacy || label !== 'reopened') {
    assert.deepEqual(seen, [], 'ordinary GUI opening must not ask to recover, restart or cancel the running task');
    return;
  }
  assert.ok(seen.length <= 1, 'legacy migration permits exactly one explicit reuse dialog');
  if (ready) assert.equal(seen.length, 1, 'legacy source migration requires explicit reuse of the original backend');
  for (const dialog of seen) {
    assert.ok(['后台暂时无法重启', '需要重启后台服务'].includes(dialog.message), 'only the startup recovery dialog is allowed');
    assert.equal(dialog.selectedButton, '继续使用原后台', 'legacy migration must choose the explicit reuse option');
  }
}
async function launch(label) {
  phase = label;
  app = await electron.launch({ executablePath: process.env.AREAL_ELECTRON_EXECUTABLE || require('electron'), args: [testApp],
    env: { ...env, AREAL_REOPEN_PHASE: label, AREAL_REOPEN_MAIN: label === 'initial' ? initialMain : currentMain }, timeout: 120000 });
  observations[`${label}GuiPid`] = app.process().pid;
  app.process().stdout?.on('data', chunk => appendFileSync(join(scratch, `${label}-stdout.log`), chunk));
  app.process().stderr?.on('data', chunk => appendFileSync(join(scratch, `${label}-stderr.log`), chunk));
  page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(`${label}: ${error.stack}`));
  await page.waitForFunction(() => typeof window.arealDesktop?.snapshot === 'function');
  await until(async () => {
    const seen = await dialogs();
    checkDialogs(seen, label);
    return (await state()).connection?.state === 'ready';
  }, `${label} Desktop ready`);
  checkDialogs(await dialogs(), label, true);
  await page.getByTestId('areal-workbench').waitFor();
}
async function closeGui() {
  if (!app) return;
  const pid = app.process().pid;
  await app.close();
  app = null;
  await until(() => !alive(pid), 'owned GUI process exit', 15000);
}
async function inspectService() {
  const metadata = JSON.parse(await readFile(join(home, 'service.json'), 'utf8'));
  const connection = new ServiceConnection();
  try {
    await connection.connect(metadata);
    const packet = await connection.request('hello', { protocol: metadata.protocol, identity: metadata.identity });
    const descriptors = [];
    for (const name of await readdir(join(registry, 'services'))) {
      try { descriptors.push(JSON.parse(await readFile(join(registry, 'services', name, 'service.json'), 'utf8'))); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const matching = descriptors.filter(value => value.workspace === workspace);
    assert.equal(matching.length, 1, 'exactly one Core service owns the fixture workspace');
    const descriptor = matching[0];
    assert.ok(descriptor.generation && descriptor.serviceId);
    assert.equal(alive(metadata.pid), true, 'original Desktop remains alive');
    return {
      desktop: { pid: metadata.pid, identity: metadata.identity },
      core: { serviceId: descriptor.serviceId, generation: descriptor.generation, hostPid: descriptor.hostPid, corePid: descriptor.corePid },
      turn: turn(packet.snapshot) ?? null,
      service: packet.service,
    };
  } finally { connection.close(); }
}
console.log('Service reopen evidence:', scratch);
try {
  await launch('initial');
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, workspace);
  await page.evaluate(() => window.arealDesktop.chooseProject());
  projectId = (await until(async () => (await state()).projects.find(value => value.root === workspace && value.state?.connected), 'connected isolated project')).id;
  await page.getByTestId('chat-input').fill('Hold this task while I close and reopen the GUI.');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  threadId = await until(() => page.getByTestId('areal-workbench').getAttribute('data-thread-id'), 'created Thread identity');
  await until(async () => requests.length === 1 && turn(await state())?.status === 'inProgress'
    && turn(await state()).items.some(item => item.type === 'agentMessage' && item.text === 'REOPEN_HELD'), 'original held streaming turn');
  turnId = turn(await state()).id;
  observations.before = await inspectService();
  assert.equal(held.size, 1);
  await page.screenshot({ path: join(scratch, '01-held-before-close.png') });
  await writeFile(join(scratch, 'before.json'), JSON.stringify(observations.before, null, 2));
  await closeGui();
  observations.closed = await inspectService();
  assert.deepEqual(observations.closed.desktop, observations.before.desktop);
  assert.deepEqual(observations.closed.core, observations.before.core);
  assert.equal(observations.closed.turn.id, turnId);
  assert.equal(observations.closed.turn.status, 'inProgress');
  checks.push('closing the owned GUI leaves the original Desktop/Core and streaming Turn running');

  phase = scenario;
  if (scenario === 'replacement') {
    await copyFile(binary, binaryBackup);
    await chmod(binaryBackup, originalStat.mode & 0o777);
    assert.equal(sha(await readFile(binaryBackup)), binarySha256, 'private same-directory backup retains the running executable');
    await copyFile(replacement, binaryStage);
    await chmod(binaryStage, originalStat.mode & 0o777);
    assert.equal(sha(await readFile(binaryStage)), replacementSha256, 'staged replacement matches the verified Mach-O source');
    await rename(binaryStage, binary);
    observations.binaryReplacement = { path: binary, source: replacement, format: replacementFormat, backup: binaryBackup,
      beforeSha256: binarySha256, afterSha256: sha(await readFile(binary)) };
    assert.equal(observations.binaryReplacement.afterSha256, replacementSha256, 'actual new binary occupies the original Core path');
    assert.notEqual(observations.binaryReplacement.afterSha256, binarySha256);
  } else if (scenario === 'mtime') {
    const changedMtime = new Date(originalStat.mtimeMs + 120000);
    await utimes(binary, originalStat.atime, changedMtime);
    observations.binaryMtime = { original: originalStat.mtimeMs, changed: (await stat(binary)).mtimeMs };
    assert.notEqual(observations.binaryMtime.changed, observations.binaryMtime.original);
    assert.equal(sha(await readFile(binary)), binarySha256, 'mtime trigger preserves deployed Core bytes');
  } else {
    assert.equal(sha(await readFile(binary)), binarySha256, 'legacy migration leaves the binary unchanged');
  }
  await launch('reopened');
  await until(async () => project(await state())?.state?.connected && turn(await state())?.id === turnId, 'original Thread restored automatically');
  observations.after = await inspectService();
  assert.deepEqual(observations.after.desktop, observations.before.desktop, 'reopen must attach to the original Desktop');
  assert.deepEqual(observations.after.core, observations.before.core, 'reopen must keep the original Core generation');
  assert.equal(observations.after.turn.id, turnId);
  assert.equal(observations.after.turn.status, 'inProgress');
  assert.equal(requests.length, 1, 'reopen must not submit or replay a model request');
  assert.equal(held.size, 1, 'original model stream remains connected');
  for (const response of held) send(response, ' REOPEN_CONTINUED');
  await until(async () => turn(await state())?.items.some(item => item.type === 'agentMessage' && item.text === 'REOPEN_HELD REOPEN_CONTINUED'), 'original stream reaches reopened GUI');
  await page.getByText('REOPEN_HELD REOPEN_CONTINUED', { exact: true }).waitFor();
  assert.equal(turn(await state()).id, turnId);
  assert.equal(turn(await state()).status, 'inProgress');
  assert.equal(requests.length, 1);
  observations.continued = await inspectService();
  assert.deepEqual(observations.continued.desktop, observations.before.desktop);
  assert.deepEqual(observations.continued.core, observations.before.core);
  assert.equal(observations.continued.turn.id, turnId);
  assert.equal(observations.continued.turn.status, 'inProgress');
  assert.ok(observations.continued.turn.items.some(item => item.type === 'agentMessage' && item.text === 'REOPEN_HELD REOPEN_CONTINUED'),
    'authoritative original service receives the continuation from the original model stream');
  observations.reopenDialogs = await dialogs();
  checkDialogs(observations.reopenDialogs, 'reopened', true);
  await page.screenshot({ path: join(scratch, '02-same-turn-after-reopen.png') });
  await writeFile(join(scratch, 'after.json'), JSON.stringify(observations.after, null, 2));
  checks.push(scenario === 'legacy'
    ? 'genuine pre-fix Desktop source permits explicit reuse with the same Desktop PID, Core generation and active Turn'
    : scenario === 'replacement'
      ? 'actual different Mach-O bytes at the same Core path permit ordinary reopen with the same Desktop PID, Core generation and active Turn'
      : 'changed deployment timestamp permits ordinary reopen with the same Desktop PID, Core generation and active Turn');
  checks.push('the original model stream continues into the reopened GUI without cancellation, restart or replay');
  assert.deepEqual(errors, []);
  passed = true;
} catch (error) {
  errors.push(`${phase}: ${error.stack}`);
  if (page) {
    await writeFile(join(scratch, 'failure-state.json'), JSON.stringify(await state().catch(() => null), null, 2));
    await page.screenshot({ path: join(scratch, 'failure.png') }).catch(() => {});
    await writeFile(join(scratch, 'failure.aria.txt'), await page.locator('body').ariaSnapshot().catch(() => 'unavailable'));
  }
  if (app) observations.failureDialogs = await dialogs().catch(() => []);
  observations.failureService = await inspectService().catch(error => ({ error: error.message }));
} finally {
  await closeGui().then(() => { cleanup.guiClosed = true; }).catch(error => errors.push(`GUI cleanup: ${error.stack}`));
  const connection = new ServiceConnection();
  try {
    const metadata = JSON.parse(await readFile(join(home, 'service.json'), 'utf8'));
    await connection.connect(metadata);
    await connection.request('hello', { protocol: metadata.protocol, identity: metadata.identity });
    const lifecycle = new DesktopLifecycle({ connection, metadata, home, notify: async () => ({ response: 1 }) });
    await until(async () => !(await lifecycle.observe()).blockers.length, 'owned service cleanup admission');
    const result = await lifecycle.stop({ mode: 'cancel' });
    assert.equal(result.kind, 'exited');
    cleanup.serviceStopped = true;
  } catch (error) {
    if (error.code === 'ENOENT') cleanup.serviceStopped = true;
    else errors.push(`service cleanup: ${error.stack}`);
  } finally { connection.close(); }
  for (const response of held) response.destroy();
  model.closeAllConnections();
  await new Promise(resolve => model.close(resolve));
  try {
    if (sha(await readFile(binary)) !== binarySha256) {
      assert.ok(binaryBackup, 'only the replacement scenario may change private Core contents');
      assert.equal(sha(await readFile(binaryBackup)), binarySha256, 'restore only the verified original binary');
      await copyFile(binaryBackup, binaryStage);
      await chmod(binaryStage, originalStat.mode & 0o777);
      await rename(binaryStage, binary);
    }
    assert.equal(sha(await readFile(binary)), binarySha256, 'private Core original contents are restored');
    if (replacement) assert.equal(sha(await readFile(replacement)), replacementSha256, 'shared replacement source remains unchanged');
    cleanup.binaryContentsRestored = true;
    await utimes(binary, originalStat.atime, originalStat.mtime);
    const restoredStat = await stat(binary);
    assert.ok(Math.abs(restoredStat.atimeMs - originalStat.atimeMs) < 1, 'restore original access timestamp');
    assert.ok(Math.abs(restoredStat.mtimeMs - originalStat.mtimeMs) < 1, 'restore original modification timestamp');
    cleanup.binaryTimestampRestored = true;
  } catch (error) { errors.push(`binary cleanup: ${error.stack}`); }
  await rm(binaryStage, { force: true }).catch(error => errors.push(`binary staging cleanup: ${error.stack}`));
  passed = passed && errors.length === 0 && Object.values(cleanup).every(Boolean);
  if (!passed) process.exitCode = 1;
  await writeFile(join(scratch, 'model-requests.json'), JSON.stringify(requests, null, 2));
  await writeFile(join(scratch, 'manifest.json'), JSON.stringify({ passed, scenario, checks, errors, cleanup, observations,
    source, binary, binarySha256, components, replacement: replacement ? { path: replacement, sha256: replacementSha256, format: replacementFormat, backup: binaryBackup } : null,
    paths: { home, workspace, registry, userData: env.AREAL_GUI_USER_DATA, initialMain, currentMain },
    identities: { projectId, threadId, turnId }, modelRequestCount: requests.length,
    boundary: 'real isolated Electron/Main/preload/Desktop/Core; local held SSE model; native picker and messageBox responses injected; no real provider or installed package' }, null, 2));
  console.log(JSON.stringify({ passed, evidence: scratch, checks, errors, cleanup }));
}
