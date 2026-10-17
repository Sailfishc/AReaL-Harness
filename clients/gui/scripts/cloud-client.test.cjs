const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { CloudClient, backendURL } = require('../app/src/core/cloud-client.cjs');

async function server(t, handler) {
  const http = createServer(handler);
  http.listen(0, '127.0.0.1');
  await once(http, 'listening');
  t.after(() => { http.closeAllConnections(); http.close(); });
  return `http://127.0.0.1:${http.address().port}/openapi/v1`;
}

test('空 Harness 创建后重复连接始终复用同一 Session', async t => {
  const requests = [];
  let active = false;
  const baseURL = await server(t, async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({ path: req.url, method: req.method, body, key: req.headers['idempotency-key'] });
    assert.equal(req.headers.authorization, 'Bearer private-token');
    res.setHeader('Content-Type', 'application/json');
    if (req.url.endsWith('/start')) { active = true; return res.end('{}'); }
    if (req.url.endsWith('/connections')) return res.end(JSON.stringify({ session_id: 'ses_1', endpoint: '/runtime-native/rt_1/', credential: 'short-lived', thread_start: { method: 'thread/start' } }));
    res.end(JSON.stringify({ session_id: 'ses_1', state: active ? 'ACTIVE' : 'STOPPED' }));
  });
  const client = new CloudClient({ baseURL, token: 'private-token' });
  await client.createSession('stable-create-id');
  for (let i = 0; i < 2; i++) {
    const connection = await client.connectSession('ses_1');
    assert.equal(connection.session.session_id, 'ses_1');
    assert.match(connection.endpoint, /^ws:\/\/127\.0\.0\.1:\d+\/runtime-native\/rt_1\/$/);
  }
  assert.deepEqual(requests[0], { path: '/openapi/v1/harness-sessions', method: 'POST', body: '{}', key: 'stable-create-id' });
  assert.equal(requests.filter(r => r.path.endsWith('/start')).length, 1);
  assert.equal(requests.filter(r => r.path.endsWith('/connections')).length, 2);
});

test('拒绝重定向且不向另一主机泄漏 bearer', async t => {
  let leaked = false;
  const target = await server(t, (_req, res) => { leaked = true; res.end('{}'); });
  const baseURL = await server(t, (_req, res) => { res.writeHead(302, { Location: target }); res.end(); });
  const client = new CloudClient({ baseURL, token: 'private-token' });
  await assert.rejects(client.createSession('id'), error => error.code === 'CLOUD_TRANSPORT_ERROR' && error.submissionUnknown && !error.message.includes('private-token'));
  assert.equal(leaked, false);
});

test('拒绝 URL 凭据、跨源连接描述和越界请求', async t => {
  assert.throws(() => backendURL('https://user:secret@example.test'));
  const baseURL = await server(t, (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(req.url.endsWith('/connections') ? { session_id: 'ses_1', endpoint: 'https://other.test/runtime', credential: 'secret' } : { state: 'ACTIVE' }));
  });
  const client = new CloudClient({ baseURL, token: 'private-token' });
  await assert.rejects(client.request('GET', '../../secrets'), /越界/);
  await assert.rejects(client.connectSession('ses_1'), /越界/);
});

test('HTTP 拒绝不会重试或回显包含密钥的响应', async t => {
  let count = 0;
  const baseURL = await server(t, (_req, res) => { count++; res.writeHead(401); res.end('private-token'); });
  const client = new CloudClient({ baseURL, token: 'private-token' });
  await assert.rejects(client.createSession('id'), error => error.status === 401 && !error.message.includes('private-token'));
  assert.equal(count, 1);
});
