import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPairSync, verify } from 'node:crypto';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { createSecureServer, connect } from 'node:http2';
import WebSocket from 'ws';
import { readConfig } from '../src/config.mjs';
import { openStore } from '../src/store.mjs';
import { serve } from '../src/server.mjs';
import { createPush } from '../src/push.mjs';
import { decodeRelayMessage } from '../../../clients/gui/packages/remote/src/relay-codec.mjs';

const cli = resolve('src/cli.mjs');
const token = 'a1'.repeat(32);
const request = { type: 'push', token, environment: 'production', collapseId: 'attention-project-opaque', kind: 'attention', count: 2,
  target: { projectId: 'project-opaque', threadId: 'thread-opaque', attentionRef: 'attention-opaque' } };
async function port() {
  const server = createNetServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const value = server.address().port; await new Promise(resolve => server.close(resolve)); return value;
}
async function until(predicate) {
  const deadline = Date.now() + 3000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error('fixture observation timeout'); await new Promise(resolve => setTimeout(resolve, 10)); }
}
async function fixture(t, { enabled = true, overrides = {}, response = () => ({ status: 200, body: '' }) } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'areal-relay-push-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const keyFile = join(dir, 'apns.p8');
  await writeFile(keyFile, privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 });
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-keyout', join(dir, 'tls.key'), '-out', join(dir, 'tls.crt'), '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
  const cert = await readFile(join(dir, 'tls.crt'));
  const apns = createSecureServer({ key: await readFile(join(dir, 'tls.key')), cert });
  const sessions = new Set(); const records = []; const origins = [];
  apns.on('session', session => { sessions.add(session); session.on('error', () => {}); session.once('close', () => sessions.delete(session)); });
  apns.on('stream', (stream, headers) => {
    stream.on('error', () => {}); const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', async () => {
      const record = { headers, payload: JSON.parse(Buffer.concat(chunks).toString()) }; records.push(record);
      const reply = await response(record);
      if (!reply) return;
      stream.respond({ ':status': reply.status }); stream.end(reply.body);
    });
  });
  await new Promise(resolve => apns.listen(0, '127.0.0.1', resolve));
  t.after(async () => { for (const session of sessions) session.destroy(); await new Promise(resolve => apns.close(resolve)); });
  const relayPort = await port(); const origin = `http://127.0.0.1:${relayPort}`; const file = join(dir, 'config.json');
  const configInput = { publicOrigin: origin, listen: `127.0.0.1:${relayPort}`, development: true, allowedClientOrigins: [origin], dataDir: join(dir, 'data'),
    ...(enabled ? { apns: { teamId: 'ABCDEFGHIJ', keyId: 'KLMNOPQRST', keyFile, bundleId: 'org.example.areal', ...overrides } } : {}) };
  await writeFile(file, JSON.stringify(configInput));
  const config = readConfig(file);
  const { code } = JSON.parse(execFileSync(process.execPath, [cli, 'enrollment', '--config', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  const store = openStore(config);
  let time = Date.now(); const logs = [];
  t.mock.method(console, 'log', value => logs.push(JSON.parse(value)));
  const server = await serve(config, store, { now: () => time, connect: remote => {
    origins.push(remote);
    return connect(`https://127.0.0.1:${apns.address().port}`, { ca: cert, servername: 'localhost' });
  } });
  let stopped = false;
  async function close() { if (stopped) return; stopped = true; await server.close(); store.close(); }
  t.after(close);
  const registration = await (await fetch(`${origin}/enroll`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) })).json();
  async function socket(registrationInput = registration, role = 'host', supportsPush = true) {
    const ws = new WebSocket(origin.replace('http:', 'ws:') + '/remote/socket', role === 'client' ? { origin } : supportsPush ? { headers: { 'X-Areal-Relay-Capabilities': 'push' } } : {});
    const events = []; const waiters = []; ws.on('error', () => {});
    ws.on('message', raw => { const event = JSON.parse(raw.toString()); const waiter = waiters.shift(); if (waiter) waiter(event); else events.push(event); });
    const next = () => events.length ? Promise.resolve(events.shift()) : new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('Relay message timeout')), 3000);
      waiters.push(value => { clearTimeout(deadline); resolve(value); });
    });
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    ws.send(JSON.stringify({ protocol: 'areal.relay.v1', role, room: registrationInput.room, ...(role === 'host' ? { capability: registrationInput.capability } : {}) }));
    return { ws, next, send: value => ws.send(JSON.stringify(value)) };
  }
  return { dir, file, configInput, keyFile, config, publicKey, records, origins, logs, close, socket, registration, store,
    advance: amount => { time += amount; }, now: () => time };
}

test('authenticated Host forwards fixed private alerts over TLS HTTP2 with ES256 JWT, cache and exact environment origins', async t => {
  const f = await fixture(t); const host = await f.socket();
  const ready = await host.next(); assert.equal(ready.push, true); assert.equal(decodeRelayMessage(JSON.stringify(ready)).push, true);
  host.send(request); await until(() => f.logs.length === 1);
  const first = f.records[0];
  assert.deepEqual(f.origins, ['https://api.push.apple.com']);
  assert.equal(first.headers[':method'], 'POST'); assert.equal(first.headers[':path'], `/3/device/${token}`);
  assert.equal(first.headers['apns-topic'], 'org.example.areal'); assert.equal(first.headers['apns-push-type'], 'alert');
  assert.equal(first.headers['apns-priority'], '10'); assert.equal(first.headers['apns-collapse-id'], request.collapseId);
  assert.deepEqual(first.payload, { aps: { alert: { title: 'AReaL', body: '电脑上有 2 项需要你确认' }, sound: 'default' }, target: request.target });
  const jwt = first.headers.authorization.slice(7); const [header, claims, signature] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url')), { alg: 'ES256', kid: 'KLMNOPQRST' });
  assert.deepEqual(JSON.parse(Buffer.from(claims, 'base64url')), { iss: 'ABCDEFGHIJ', iat: Math.floor(f.now() / 1000) });
  assert.equal(Buffer.from(signature, 'base64url').length, 64);
  assert.equal(verify('sha256', Buffer.from(`${header}.${claims}`), { key: f.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')), true);
  f.advance(49 * 60000);
  host.send({ ...request, environment: 'development', kind: 'turnCompleted' }); await until(() => f.logs.length === 2);
  assert.deepEqual(f.origins, ['https://api.push.apple.com', 'https://api.sandbox.push.apple.com']);
  assert.equal(f.records[1].headers.authorization, first.headers.authorization);
  assert.equal(f.records[1].payload.aps.alert.body, '你在手机上发起的会话已完成');
  f.advance(2 * 60000);
  host.send({ ...request, kind: 'turnFailed', target: undefined }); await until(() => f.logs.length === 3);
  assert.notEqual(f.records[2].headers.authorization, first.headers.authorization);
  assert.deepEqual(f.records[2].payload, { aps: { alert: { title: 'AReaL', body: '你在手机上发起的会话没有完成' }, sound: 'default' } });
  for (const entry of f.logs) assert.deepEqual(Object.keys(entry).sort(), ['kind', 'route', 'status', 'time']);
  const logged = JSON.stringify(f.logs); for (const secret of [token, ...Object.values(request.target), jwt]) assert.equal(logged.includes(secret), false);
  await f.close();
  for (const file of await readdir(f.config.dataDir)) {
    const data = await readFile(join(f.config.dataDir, file));
    for (const secret of [token, ...Object.values(request.target)]) assert.equal(data.includes(secret), false);
  }
});

test('410 Unregistered returns only sanitized token result and does not expose APNs error body', async t => {
  const secret = 'apns-private-diagnostic';
  const f = await fixture(t, { response: () => ({ status: 410, body: JSON.stringify({ reason: 'Unregistered', diagnostic: secret }) }) });
  const host = await f.socket(); await host.next(); host.send(request);
  const result = await host.next(); assert.deepEqual(result, { type: 'pushResult', token, status: 'unregistered' });
  assert.deepEqual(decodeRelayMessage(JSON.stringify(result)), result);
  assert.equal(f.logs[0].status, 410); assert.equal(JSON.stringify(f.logs).includes(secret), false);
});

test('an in-flight unregistered result reaches the replacement Host for the same room', async t => {
  let reply;
  const response = new Promise(resolve => { reply = resolve; });
  const f = await fixture(t, { response: () => response });
  const host = await f.socket(); await host.next(); host.send(request);
  await until(() => f.records.length === 1);
  const replacement = await f.socket(); assert.equal((await replacement.next()).push, true);
  assert.equal((await host.next()).code, 'REPLACED');
  reply({ status: 410, body: JSON.stringify({ reason: 'Unregistered' }) });
  assert.deepEqual(await replacement.next(), { type: 'pushResult', token, status: 'unregistered' });
  assert.equal(replacement.ws.readyState, WebSocket.OPEN);
});

test('legacy Hosts receive the original ready shape while capable Hosts opt in with an HTTP header', async t => {
  for (const enabled of [false, true]) {
    const f = await fixture(t, { enabled });
    const legacy = await f.socket(f.registration, 'host', false);
    const ready = await legacy.next();
    assert.deepEqual(Object.keys(ready).sort(), ['limits', 'type']);
    assert.equal(decodeRelayMessage(JSON.stringify(ready)).type, 'ready');
    const capable = await f.socket();
    assert.equal((await capable.next()).push, enabled);
    assert.equal((await legacy.next()).code, 'REPLACED');
  }
});

test('registered room push budget survives Host replacement, is independent per room, and resets after a minute without queues', async t => {
  const f = await fixture(t, { overrides: { maxPerHostPerMinute: 1 } });
  const host = await f.socket(); await host.next(); host.send(request); await until(() => f.logs.length === 1);
  const replacement = await f.socket(); await replacement.next(); await host.next();
  replacement.send(request); assert.deepEqual(await replacement.next(), { type: 'error', code: 'LIMIT_EXCEEDED' }); assert.equal(f.records.length, 1);
  const code = f.store.enrollment().code;
  const second = f.store.enroll(code); const independent = await f.socket(second); await independent.next();
  independent.send(request); await until(() => f.logs.length === 3); assert.equal(f.records.length, 2);
  f.advance(60000); replacement.send(request); await until(() => f.records.length === 3);
  assert.equal(replacement.ws.readyState, WebSocket.OPEN);
});

test('disabled push declares false and emits unavailable without opening APNs or disturbing Host channels', async t => {
  const f = await fixture(t, { enabled: false }); const host = await f.socket();
  const ready = await host.next(); assert.equal(ready.push, false);
  assert.equal(decodeRelayMessage(JSON.stringify({ type: 'ready', limits: ready.limits })).push, undefined);
  host.send(request); assert.deepEqual(await host.next(), { type: 'error', code: 'UNAVAILABLE' });
  const client = await f.socket(f.registration, 'client'); const clientReady = await client.next(); await host.next();
  client.send({ type: 'data', channel: clientReady.channel, data: 'c3RpbGwtd29ya3M=' });
  assert.equal((await host.next()).data, 'c3RpbGwtd29ya3M='); assert.equal(f.origins.length, 0); assert.equal(f.records.length, 0);
});

test('Client role, unregistered role, unknown text, invalid parameters and oversized frames cannot request APNs', async t => {
  const f = await fixture(t);
  const invalid = [
    { ...request, text: 'secret-project-title-prompt-tool' }, { ...request, token: 'a'.repeat(63) }, { ...request, token: 'a'.repeat(201) },
    { ...request, token: 'z'.repeat(64) }, { ...request, environment: 'sandbox' }, { ...request, collapseId: '界'.repeat(22) }, { ...request, collapseId: '' },
    { ...request, count: 0 }, { ...request, count: 1.5 }, { ...request, count: Number.MAX_SAFE_INTEGER + 1 }, { ...request, kind: 'arbitrary' },
    { ...request, target: { projectId: '界'.repeat(86) } }, { ...request, target: { threadId: 42 } }, { ...request, target: { projectId: '' } },
    { ...request, target: { title: 'secret-title' } }, { ...request, target: null }, { ...request, target: [] },
  ];
  for (const message of invalid) {
    const host = await f.socket(); await host.next(); host.send(message);
    assert.deepEqual(await host.next(), { type: 'error', code: 'INVALID_FRAME' });
  }
  const host = await f.socket(); await host.next();
  const client = await f.socket(f.registration, 'client'); await client.next(); await host.next();
  client.send(request); assert.deepEqual(await client.next(), { type: 'error', code: 'INVALID_FRAME' }); await host.next();
  host.send({ ...request, padding: 'a'.repeat(524288) });
  await new Promise(resolve => host.ws.once('close', resolve));
  const unauthenticated = new WebSocket(f.configInput.publicOrigin.replace('http:', 'ws:') + '/remote/socket');
  unauthenticated.on('error', () => {});
  await new Promise(resolve => unauthenticated.once('open', resolve));
  const denied = new Promise(resolve => unauthenticated.once('message', raw => resolve(JSON.parse(raw.toString()))));
  unauthenticated.send(JSON.stringify(request)); assert.equal((await denied).code, 'UNAVAILABLE');
  assert.equal(f.records.length, 0); assert.equal(f.origins.length, 0);
  assert.equal(JSON.stringify(f.logs).includes('secret-project-title-prompt-tool'), false);
});

test('HTTP2 inflight requests are bounded and service close ends hanging streams without retry', async t => {
  const f = await fixture(t, { overrides: { maxPerHostPerMinute: 600 }, response: () => null });
  const host = await f.socket(); await host.next();
  for (let i = 0; i < 33; i++) host.send(request);
  assert.deepEqual(await host.next(), { type: 'error', code: 'LIMIT_EXCEEDED' }); await until(() => f.records.length === 32);
  await f.close(); await until(() => f.logs.filter(entry => 'status' in entry).length === 32);
  assert.equal(f.origins.length, 1); assert.equal(f.records.length, 32);
});

test('configured APNs is loaded only by serving and CLI rejects missing key without revealing its path', async t => {
  const f = await fixture(t, { enabled: false }); await f.close();
  const missing = join(f.dir, 'secret-apns-key-location.p8');
  const enabled = { ...f.configInput, apns: { teamId: 'ABCDEFGHIJ', keyId: 'KLMNOPQRST', keyFile: missing, bundleId: 'org.example.areal' } };
  await writeFile(f.file, JSON.stringify(enabled));
  const enrollment = JSON.parse(execFileSync(process.execPath, [cli, 'enrollment', '--config', f.file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  assert.equal(typeof enrollment.code, 'string');
  const child = spawn(process.execPath, [cli, 'serve', '--config', f.file], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; });
  const code = await new Promise(resolve => child.once('exit', resolve));
  assert.equal(code, 1); assert.match(output, /OPERATION_FAILED/); assert.equal(output.includes(missing), false); assert.equal(f.origins.length, 0);
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  await writeFile(f.keyFile, privateKey.export({ format: 'pem', type: 'pkcs8' }));
  assert.throws(() => createPush({ ...enabled.apns, keyFile: f.keyFile }), { message: 'CONFIG_APNS_KEY' });
});

test('a stalled APNs stream times out once and releases admission without retrying or leaking a response body', { timeout: 15000 }, async t => {
  const f = await fixture(t, { response: () => null }); const host = await f.socket(); await host.next();
  host.send(request); await until(() => f.records.length === 1);
  const deadline = Date.now() + 12000;
  while (!f.logs.some(entry => entry.status === 0)) { assert.ok(Date.now() < deadline, 'APNs request must have an absolute deadline'); await new Promise(resolve => setTimeout(resolve, 25)); }
  assert.equal(f.records.length, 1); assert.equal(f.origins.length, 1); assert.equal(host.ws.readyState, WebSocket.OPEN);
});

test('APNs rejection is logged as status only and never queued or retried', async t => {
  const secret = 'provider-raw-error-secret';
  const f = await fixture(t, { response: () => ({ status: 503, body: JSON.stringify({ reason: secret }) }) });
  const host = await f.socket(); await host.next(); host.send(request); await until(() => f.logs.some(entry => entry.status === 503));
  assert.equal(f.records.length, 1); assert.equal(f.origins.length, 1); assert.equal(JSON.stringify(f.logs).includes(secret), false);
  assert.equal(host.ws.readyState, WebSocket.OPEN);
  for (const push of ['yes', 1, null, {}]) assert.throws(() => decodeRelayMessage(JSON.stringify({ type: 'ready', limits: { framesPerSecond: 80, bytesPerSecond: 2097152, maxFrameBytes: 524288, heartbeatIntervalMs: 15000 }, push })));
  for (const result of [{ type: 'pushResult', token, status: 'sent' }, { type: 'pushResult', token, status: 'unregistered', text: secret }, { type: 'pushResult', token: 'invalid', status: 'unregistered' }]) assert.throws(() => decodeRelayMessage(JSON.stringify(result)));
});
