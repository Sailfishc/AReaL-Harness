import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { CoreClient } from '../packages/runtime-client/core.js';

const require = createRequire(new URL('../app/package.json', import.meta.url));
const { WebSocket, WebSocketServer } = require('ws');

async function fixture(run) {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  let peer;
  const received = [];
  server.on('connection', socket => {
    peer = socket;
    socket.on('message', raw => {
      const request = JSON.parse(raw);
      received.push(request);
      if (request.method === 'initialize' || request.method === 'areal/capabilities')
        socket.send(JSON.stringify({ id: request.id, result: { methods: [] } }));
    });
  });
  const client = new CoreClient({ createSocket: () => new WebSocket(`ws://127.0.0.1:${server.address().port}`) });
  try {
    await client.connect();
    await run(client, () => peer, received);
  } finally {
    client.close();
    for (const socket of server.clients) socket.terminate();
    await new Promise(resolve => server.close(resolve));
  }
}

test('lost history reads are disconnected reads while writes retain unknown outcomes', async () => {
  await fixture(async (client, peer) => {
    const read = client.request('areal/thread/observe', { threadId: 'history' }).catch(error => error);
    const write = client.request('turn/start', { threadId: 'history' }).catch(error => error);
    const unknown = client.request('future/method', {}).catch(error => error);
    peer().terminate();
    const [readError, writeError, unknownError] = await Promise.all([read, write, unknown]);
    assert.equal(readError.code, 'DISCONNECTED');
    assert.equal(readError.submissionUnknown, false, 'history observation has no submission to reconcile');
    assert.equal(writeError.code, 'RESPONSE_UNKNOWN');
    assert.equal(writeError.submissionUnknown, true);
    assert.equal(unknownError.submissionUnknown, true, 'unclassified operations remain conservative');
  });
});

test('history timeouts are read failures and never replay the request', async () => {
  await fixture(async (client, _peer, received) => {
    await assert.rejects(client.request('thread/read', { threadId: 'history', includeTurns: true }, { timeoutMs: 20 }), error => {
      assert.notEqual(error.code, 'RESPONSE_UNKNOWN');
      assert.equal(error.submissionUnknown, false);
      return true;
    });
    assert.equal(received.filter(request => request.method === 'thread/read').length, 1);
    assert.equal(client.ready, true, 'one read timeout does not close the shared observer');
  });
});

test('mutation timeouts remain unknown and never replay the request', async () => {
  await fixture(async (client, _peer, received) => {
    await assert.rejects(client.request('turn/start', { threadId: 'history' }, { timeoutMs: 20 }), error => {
      assert.equal(error.code, 'RESPONSE_UNKNOWN');
      assert.equal(error.submissionUnknown, true);
      return true;
    });
    assert.equal(received.filter(request => request.method === 'turn/start').length, 1);
  });
});
