import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const gui = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(gui, 'app/package.json'));
const { CoreBackend } = require('../app/src/core/backend.cjs');
const scratch = await mkdtemp('/private/tmp/areal-large-history-');
const workspace = join(scratch, 'workspace');
const home = join(scratch, 'desktop');
await mkdir(workspace);
await mkdir(join(scratch, 'user', '.areal'), { recursive: true });
let requests = 0;
const part = 'H'.repeat(64 * 1024);
const model = createServer(async (request, response) => {
  for await (const _ of request) {}
  requests++;
  response.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const chunk = (delta, finish_reason = null) => response.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
  for (let index = 0; index < 48; index++) chunk({content: part});
  chunk({content: 'HISTORY_END_SENTINEL'});
  chunk({}, 'stop');
  response.end('data: [DONE]\n\n');
});
await new Promise(resolve => model.listen(0, '127.0.0.1', resolve));
const config = join(scratch, 'user', '.areal', 'config.toml');
await writeFile(config, `schema_version=1\n[model]\nprovider="fixture"\nname="fixture"\ncontext_window_tokens=2000000\n[model.providers.fixture]\nprotocol="chat-completions"\nendpoint="http://127.0.0.1:${model.address().port}/v1/chat/completions"\n`);
const deployment = join(scratch, 'desktop.json');
await writeFile(deployment, JSON.stringify({ profiles: [{ id: 'fixture', revision: 'v1', displayName: 'Fixture', instructions: 'Complete the task' }] }));
const backendOptions = { binary: process.env.AREAL_CORE_BIN || resolve(gui, '../../target/debug/areal'),
  home, harnessHome: join(scratch, 'registry'), userHome: join(scratch, 'user'),
  desktopConfig: deployment, defaultProfile: { id: 'fixture', revision: 'v1' } };
let backend = new CoreBackend(backendOptions);
const checks = [];
async function until(predicate, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 30)); }
  throw new Error(`Timeout: ${label}`);
}
let passed = false;
try {
  await backend.init();
  const projectId = await backend.addProject(workspace);
  const project = backend.projects.get(projectId);
  const {threadId} = await backend.command('create', {projectId});
  for (let index = 0; index < 2; index++) {
    await backend.command('send', {projectId, threadId, text: `history fixture ${index}`});
    await until(() => {
      const turns = project.model.state.threads[threadId]?.turns ?? [];
      const failed = turns.find(turn => turn.status === 'failed');
      if (failed) throw new Error(`Fixture turn failed: ${JSON.stringify(failed.error)}`);
      return turns.filter(turn => turn.status === 'completed').length === index + 1;
    }, 'fixture turn completed', 60000);
  }
  const original = JSON.parse(JSON.stringify(project.model.state.threads[threadId]));
  assert.ok(Buffer.byteLength(JSON.stringify(original)) > 6 * 1024 * 1024, 'accumulated history exceeds the old frame ceiling without exceeding the per-response model budget');
  const generation = project.service.generation;
  const modelRequests = requests;
  await backend.openThread(project, threadId);
  assert.equal(project.client.ready, true, 'opening large history keeps Core connected');
  assert.equal(project.model.state.threads[threadId].turns.length, original.turns.length);
  assert.match(JSON.stringify(project.model.state.threads[threadId]), /HISTORY_END_SENTINEL/);
  checks.push('complete history above 6 MiB loads through the production Core WebSocket without disconnecting');
  const previous = project.client;
  previous.socket.terminate();
  await until(() => project.client !== previous && project.model.state.connected && !backend.starting.has(projectId), 'large history reconnect', 60000);
  assert.equal(project.service.generation, generation);
  assert.equal(requests, modelRequests, 'recovery never resubmits model work');
  assert.deepEqual(JSON.parse(JSON.stringify(project.model.state.threads[threadId].turns)), original.turns);
  checks.push('observer reconnect restores the same complete history without restarting Core or replaying a turn');
  const {threadId: healthyThreadId} = await backend.command('create', {projectId});
  const knownRequestId = Object.entries(project.outcomes).find(([, result]) => result.threadId === threadId && result.accepted)?.[0];
  assert.ok(knownRequestId, 'fixture has an accepted submission receipt');
  const path = join(project.service.dataDir, `${threadId}.json`);
  await backend.shutdown();
  await backend.disconnect();
  const record = JSON.parse(await readFile(path, 'utf8'));
  const item = record.thread.turns.flatMap(turn => turn.items).find(item => item.type === 'agentMessage');
  item.text = 'X'.repeat(64 * 1024 * 1024);
  await writeFile(path, JSON.stringify(record));
  backend = new CoreBackend(backendOptions);
  await backend.init();
  const restored = await backend.loadProjectJournal(projectId);
  restored.model.replace(original);
  await backend.changePending(restored, pending => [...pending, { method: 'areal/turn/submit', params: { threadId, requestId: knownRequestId } }]);
  await backend.start(projectId);
  assert.equal(restored.client.ready, true, 'one oversized cached view does not disconnect the project');
  assert.equal(restored.model.state.connected, true);
  assert.equal(restored.observationErrors[threadId].code, 'RESPONSE_TOO_LARGE');
  assert.equal(restored.pending.length, 0, 'known accepted receipt is settled even when its history cannot be delivered');
  assert.equal(restored.outcomes[knownRequestId].accepted, true);
  await assert.rejects(backend.openThread(restored, threadId), error => error.code === 'RESPONSE_TOO_LARGE' && error.submissionUnknown === false);
  await backend.openThread(restored, healthyThreadId);
  assert.equal(restored.client.ready, true);
  assert.equal(restored.model.state.threads[healthyThreadId].id, healthyThreadId);
  await assert.rejects(backend.command('send', { projectId, threadId, text: 'must not execute on a stale baseline' }), error => error.code === 'RESPONSE_TOO_LARGE' && error.submissionUnknown === false);
  for (const method of ['areal/goal/create', 'areal/queue/steer']) {
    await assert.rejects(backend.submit(restored, method, { threadId }), error => error.code === 'RESPONSE_TOO_LARGE' && error.submissionUnknown === false);
  }
  assert.equal(requests, modelRequests, 'size failures and receipt recovery do not replay or start model work');
  checks.push('over-64MiB synthetic persisted history returns a correlated read error while a healthy chat and known receipt remain usable');
  checks.push('cached oversized history cannot submit unobservable work');
  await backend.shutdown();
  await backend.disconnect();
  passed = true;
} finally {
  if (!passed) {
    for (const project of backend.projects.values()) {
      try { await project.client?.request('areal/server/drain', { strategy: 'cancel' }); } catch {}
    }
    await backend.shutdown().catch(() => backend.disconnect());
  }
  model.closeAllConnections();
  await new Promise(resolve => model.close(resolve));
  await writeFile(join(scratch, 'manifest.json'), JSON.stringify({ passed, checks, scope: 'production CoreBackend and Core WebSocket; deterministic 3MiB model responses; over-64MiB store and retained-cache failure injection after owned Core shutdown; no Renderer acceptance' }, null, 2));
  console.log(JSON.stringify({ passed, evidence: scratch, checks }));
}
