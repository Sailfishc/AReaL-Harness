import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const gui = resolve(import.meta.dirname, '..');
const require = createRequire(join(gui, 'app/package.json'));
const { _electron: electron } = require('playwright-core');
const { applicationFixture } = await import('./application-fixture.mjs');
const { ServiceConnection } = require('../app/src/core/service-client.cjs');
const { DesktopLifecycle } = require('../app/src/core/lifecycle.cjs');
const binary = process.env.AREAL_CORE_BIN || resolve(gui, '../../.local/dev-bin/areal');
const scratch = await mkdtemp('/private/tmp/areal-feedback-');
const home = join(scratch, 'core'), workspace = join(scratch, 'workspace');
const registry = join(scratch, 'a-realistic-long-service-home-that-exceeds-the-unix-socket-budget', 'registry');
await mkdir(workspace); await mkdir(join(scratch, 'user/.areal'), { recursive: true });
await writeFile(join(scratch, 'user/.areal/config.toml'), 'schema_version=1\n[model]\nprovider="fixture"\nname="fixture"\n[model.providers.fixture]\nprotocol="chat-completions"\nendpoint="http://127.0.0.1:1/v1/chat/completions"\n');
const fixture = await applicationFixture(gui, join(scratch, 'app'));
const env = { ...process.env };
for (const key of Object.keys(env)) if (/^(AREAL_|OPENAI_|ANTHROPIC_)/.test(key) || key === 'ELECTRON_RUN_AS_NODE') delete env[key];
Object.assign(env, { AREAL_CORE_BIN: binary, AREAL_GUI_USER_DATA: join(scratch, 'electron'), AREAL_CORE_HOME: home,
  AREAL_CORE_USER_HOME: join(scratch, 'user'), AREAL_HARNESS_SERVICE_HOME: registry });
let app, page, passed = false;
const checks = [], errors = [];
console.log('Evidence: ' + scratch);
try {
  app = await electron.launch({ executablePath: require('electron'), args: [fixture.path], env, timeout: 120000 });
  page = await app.firstWindow(); page.setDefaultTimeout(30000);
  await page.getByTestId('areal-workbench').waitFor({ timeout: 120000 });
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, workspace);
  await page.waitForFunction(async () => { const s = await window.arealDesktop.snapshot(); return s.connection?.state === 'ready' || s.projects.some(p => p.error || p.state?.error); });
  const startup = await page.evaluate(() => window.arealDesktop.snapshot());
  const startupError = startup.projects.find(p => p.error || p.state?.error);
  assert.ok(!startupError, startupError?.error || startupError?.state?.error);
  await page.getByRole('button', { name: '打开项目', exact: true }).first().click();
  let snapshot, project;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    snapshot = await page.evaluate(() => window.arealDesktop.snapshot());
    project = snapshot.projects.find(p => p.root === workspace);
    if (project && (project.state?.connected || project.error || project.state?.error)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await writeFile(join(scratch, 'snapshot.json'), JSON.stringify(snapshot, null, 2));
  await page.screenshot({ path: join(scratch, 'project.png'), scale: 'css' });
  assert.ok(project?.state?.connected, project?.error || project?.state?.error || 'Project must connect with a long service home');
  checks.push('Long service home opens a connected project through the directory picker');
  passed = true;
} catch (error) {
  errors.push(error.message); process.exitCode = 1;
  if (page) {
    await writeFile(join(scratch, 'failure.txt'), await page.locator('body').innerText()).catch(() => {});
    await page.screenshot({ path: join(scratch, 'failure.png'), scale: 'css' }).catch(() => {});
  }
} finally {
  const connection = new ServiceConnection();
  try {
    const metadata = JSON.parse(await readFile(join(home, 'service.json'), 'utf8'));
    await connection.connect(metadata);
    await connection.request('hello', { protocol: metadata.protocol, identity: metadata.identity });
    await page?.close();
    await new Promise(resolve => setTimeout(resolve, 300));
    await new DesktopLifecycle({ connection, metadata, home, notify: async () => ({ response: 1 }) }).stop({ mode: 'cancel' });
  } catch (error) { if (error.code !== 'ENOENT') { errors.push('cleanup: ' + error.message); passed = false; process.exitCode = 1; } }
  finally { connection.close(); }
  if (app) { await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); await app.close().catch(() => {}); }
  await fixture.close();
  await writeFile(join(scratch, 'manifest.json'), JSON.stringify({ passed, checks, errors, binary,
    binarySHA256: createHash('sha256').update(await readFile(binary)).digest('hex'),
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    boundary: 'Source Electron/Main/Core, injected native directory selection, isolated registry/home/workspace, no provider request' }, null, 2));
  console.log(`${passed ? 'PASS' : 'FAIL'} service feedback`);
  console.log(JSON.stringify({ passed, evidence: scratch, errors }));
}
