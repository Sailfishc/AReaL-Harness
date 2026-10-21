'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DesktopService } = require('../app/src/core/service-protocol.cjs');
const { McpAppsHost } = require('../app/src/core/mcp-apps.cjs');
const declaration = { version: 1, documentId: 'document', tools: ['getSelection', 'applyPatch'] };
const registration = { registrationId: 'registration', documentId: 'document', tools: [
  { kind: 'getSelection', name: 'get_selection', schemaDigest: 'read-schema' },
  { kind: 'applyPatch', name: 'apply_patch', schemaDigest: 'write-schema' },
] };
const notice = { threadId: 'thread', turnId: 'turn', callId: 'call', registrationId: 'registration', ownerId: 'lease', schemaDigest: 'read-schema' };
const grant = { status: 'granted', claimId: 'claim', kind: 'getSelection', documentId: 'document', arguments: {} };
const instance = { instanceId: 'instance', generation: 1, serverId: 'server',
  resource: { html: '<html></html>', mimeType: 'text/html;profile=mcp-app' }, hostContext: {} };
const tick = () => new Promise(resolve => setImmediate(resolve));
function socket() { return { readyState: 1, bufferedAmount: 0, packets: [], send(value) { this.packets.push(JSON.parse(value)); } }; }
function serviceFixture() {
  const calls = [];
  const client = { ready: true, async request(method, params) {
    calls.push({ method, params });
    if (method.endsWith('/register')) return registration;
    if (method.endsWith('/claim')) return grant;
    return { status: 'accepted', revoked: true };
  } };
  const project = { client, model: { state: { threads: { thread: {} } } } };
  const backend = { projects: new Map([['project', project]]), starting: new Map(), providers: { redact: value => value },
    hasWork: () => false, snapshot: () => ({}), analytics: { sample() {} },
    async command(_name, request, context) {
      const value = request.operation === 'mcpAppOpenFromResult' ? { status: 'open', instance } : instance;
      context.onMcpAppOpened?.(project, client, request, value);
      return value;
    },
  };
  const service = new DesktopService(backend, 'test'); service.schedule = () => {};
  const a = socket(), b = socket(); service.clients.add(a); service.clients.add(b);
  let id = 0;
  async function request(owner, method, params) {
    const requestId = ++id; await service.receive(owner, Buffer.from(JSON.stringify({ id: requestId, method, params })));
    return owner.packets.find(packet => packet.id === requestId);
  }
  const open = (owner, operation = 'mcpAppOpen') => request(owner, 'command', { name: 'manage', request: {
    operation, projectId: 'project', threadId: 'thread', ...(operation === 'mcpAppOpenFromResult' ? { turnId: 'turn', itemId: 'item' } : {}), requestId: 'open',
  } });
  const ready = owner => request(owner, 'mcpPageTools', { operation: 'register', projectId: 'project', threadId: 'thread', instanceId: 'instance', generation: 1, declaration });
  return { service, backend, project, client, calls, a, b, request, open, ready };
}
test('Desktop binds each open variant before returning and refuses a sibling socket', async () => {
  for (const operation of ['mcpAppOpen', 'mcpAppOpenFromResult']) {
    const f = serviceFixture();
    assert.ok((await f.open(f.a, operation)).result);
    assert.deepEqual((await f.ready(f.a)).result, registration);
    assert.match((await f.ready(f.b)).error.message, /owner|lease/i);
    assert.match((await f.open(f.b, operation)).error.message, /owner|lease/i);
    assert.equal(f.calls.filter(call => call.method.endsWith('/register')).length, 1);
    const originalOwner = f.calls[0].params.ownerId;
    f.backend.command = async (_name, request, context) => {
      const second = { ...instance, instanceId: 'second' };
      context.onMcpAppOpened(f.project, f.client, request, second); return second;
    };
    await f.open(f.a);
    assert.deepEqual((await f.request(f.a, 'mcpPageTools', { operation: 'register', projectId: 'project', threadId: 'thread', instanceId: 'second', generation: 1, declaration })).result, registration);
    assert.equal(f.calls.at(-1).params.ownerId, originalOwner, 'one Main socket shares the eight-registration budget');
  }
});
test('Desktop directs notices to opening socket and original CoreClient only', async () => {
  const f = serviceFixture(); await f.open(f.a); assert.deepEqual((await f.ready(f.a)).result, registration);
  const ownerId = f.calls[0].params.ownerId;
  f.backend.onMcpPageToolNotice?.({ projectId: 'project', client: f.client, method: 'areal/mcp/app/tools/pending', params: { ...notice, ownerId } });
  assert.equal(f.a.packets.filter(p => p.method === 'mcpPageToolNotice').length, 1);
  assert.equal(f.b.packets.filter(p => p.method === 'mcpPageToolNotice').length, 0);
  f.backend.onMcpPageToolNotice?.({ projectId: 'project', client: {}, method: 'areal/mcp/app/tools/pending', params: { ...notice, ownerId } });
  assert.equal(f.a.packets.filter(p => p.method === 'mcpPageToolNotice').length, 1);
  f.project.client = { ready: true };
  assert.match((await f.ready(f.a)).error.message, /owner|lease/i);
});
test('Desktop socket loss revokes the opening lease without transfer', async () => {
  const f = serviceFixture(); await f.open(f.a); assert.deepEqual((await f.ready(f.a)).result, registration);
  f.a.readyState = 3; f.service.revokeMcpPageTools?.(lease => lease.socket === f.a);
  await tick();
  assert.equal(f.calls.at(-1).method, 'areal/mcp/app/tools/revoke');
  assert.match((await f.ready(f.b)).error.message, /owner|lease/i);
});
async function mainFixture() {
  const calls = [], events = [];
  const backend = { ownsThread: () => true, snapshot: () => ({ connection: { state: 'ready' }, projects: [] }),
    command: async (_name, params) => params.operation === 'mcpAppOpen' ? instance : {},
    async mcpPageTools(params) { calls.push(params); if (params.operation === 'register') return registration;
      if (params.operation === 'claim') return grant; return { status: 'accepted' }; },
  };
  const host = new McpAppsHost({ backend, ownerId: 7, notify: event => events.push(event) });
  const app = await host.open({ projectId: 'project', threadId: 'thread', serverId: 'server', expectedGeneration: 1, toolName: 'editor' }, 7);
  const ready = () => host.pageToolsReady?.(app.token, 'mount', declaration, 7);
  const pending = () => host.pageToolNotice?.({ projectId: 'project', instanceId: 'instance', generation: 1, method: 'areal/mcp/app/tools/pending', params: notice });
  return { host, backend, calls, events, app, ready, pending };
}
test('Main registers one initialized mount and dispatches only after a grant', async () => {
  const f = await mainFixture();
  assert.deepEqual(await f.ready(), registration);
  await assert.rejects(f.host.pageToolsReady(f.app.token, 'other-mount', declaration, 7), /mount|revoked/i);
  await f.pending();
  const event = f.events.find(e => e.notification.method === 'areal/notifications/page-tool-call');
  assert.deepEqual(event.notification.params, { mountId: 'mount', callId: 'call', kind: 'getSelection', documentId: 'document', arguments: {} });
  assert.equal(f.calls[1].operation, 'claim');
  await f.host.pageToolResult(f.app.token, 'mount', 'call', { status: 'unknown' }, 7);
  assert.deepEqual(f.calls.at(-1), { operation: 'resolve', projectId: 'project', instanceId: 'instance', generation: 1, ...notice, claimId: 'claim', reply: { status: 'unknown' } });
});
test('Main cancellation during claim await prevents dispatch and reports no effect', async () => {
  const f = await mainFixture(); assert.deepEqual(await f.ready(), registration);
  let release; f.backend.mcpPageTools = async params => { f.calls.push(params); return params.operation === 'claim' ? new Promise(resolve => { release = resolve; }) : { status: 'accepted' }; };
  const pending = f.pending(); await tick();
  await f.host.pageToolNotice({ projectId: 'project', instanceId: 'instance', generation: 1, method: 'areal/mcp/app/tools/cancelled', params: notice });
  release(grant); await pending;
  assert.deepEqual(f.events.filter(e => e.notification.method === 'areal/notifications/page-tool-call'), []);
  assert.deepEqual(f.calls.at(-1).reply, { status: 'noEffect', reason: 'cancelled' });
});
test('Main disconnect retains iframe but permanently fences tools across reconnect', async () => {
  const f = await mainFixture(); assert.deepEqual(await f.ready(), registration);
  f.host.pageToolsDisconnected();
  assert.equal(f.host.instances.get(f.app.token).closed, false);
  assert.equal((await f.host.resource({ method: 'GET', url: f.app.frameUrl })).status, 200);
  await assert.rejects(f.ready(), /revoked|lease/i);
  await f.pending();
  assert.equal(f.events.filter(e => e.notification.method === 'areal/notifications/page-tool-call').length, 0);
});
test('Guest management routes remain rejected by the existing request boundary', async () => {
  const f = await mainFixture();
  for (const method of ['areal/mcp/app/tools/register', 'areal/mcp/app/tools/claim', 'areal/mcp/app/tools/resolve']) {
    await assert.rejects(f.host.request(f.app.token, { jsonrpc: '2.0', id: method, method, params: {} }, 7), /unsupported/);
  }
  assert.equal((await f.host.resource({ method: 'GET', url: f.app.frameUrl })).status, 200);
});

test('Main close after durable claim before dispatch proves no effect', async () => {
  const f = await mainFixture(); assert.deepEqual(await f.ready(), registration);
  let release; f.backend.mcpPageTools = async params => { f.calls.push(params); return params.operation === 'claim' ? new Promise(resolve => { release = resolve; }) : { status: 'accepted' }; };
  const pending = f.pending(); await tick(); await f.host.close(f.app.token, 7); release(grant); await pending;
  assert.equal(f.events.filter(e => e.notification.method === 'areal/notifications/page-tool-call').length, 0);
  assert.deepEqual(f.calls.at(-1).reply, { status: 'noEffect', reason: 'closed' });
});
test('Main cancellation after dispatch requires explicit execution evidence', async () => {
  const f = await mainFixture(); assert.deepEqual(await f.ready(), registration); await f.pending();
  await f.host.pageToolNotice({ projectId: 'project', instanceId: 'instance', generation: 1, method: 'areal/mcp/app/tools/cancelled', params: { ...notice, claimId: 'claim' } });
  assert.deepEqual(f.events.at(-1).notification, { jsonrpc: '2.0', method: 'areal/notifications/page-tool-cancelled', params: { mountId: 'mount', callId: 'call' } });
  assert.equal(f.calls.filter(c => c.operation === 'resolve').length, 0);
  await f.host.pageToolResult(f.app.token, 'mount', 'call', { status: 'unknown' }, 7);
  assert.deepEqual(f.calls.at(-1).reply, { status: 'unknown' });
});
test('Main rejects declarations and result fields outside the finite protocol', async () => {
  const f = await mainFixture(); assert.deepEqual(await f.ready(), registration);
  await assert.rejects(f.host.pageToolsReady(f.app.token, 'mount', { ...declaration, tools: ['eval'] }, 7), /Invalid|declaration/);
  await f.pending();
  await assert.rejects(f.host.pageToolResult(f.app.token, 'mount', 'call', { status: 'noEffect', reason: 'timeout' }, 7), /Invalid/);
  await assert.rejects(f.host.pageToolResult(f.app.token, 'wrong', 'call', { status: 'unknown' }, 7), /mount|stale/);
  await f.host.pageToolResult(f.app.token, 'mount', 'call', { status: 'noEffect', reason: 'cancelled' }, 7);
  assert.deepEqual(f.calls.at(-1).reply, { status: 'noEffect', reason: 'cancelled' });
});
