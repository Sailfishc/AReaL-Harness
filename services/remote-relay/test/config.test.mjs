import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConfig } from '../src/config.mjs';

test('App Origins default to empty and accept exact custom scheme hosts in production', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'areal-relay-config-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'config.json');
  const base = { publicOrigin: 'https://relay.example', listen: '127.0.0.1:8080', trustedLocalTlsProxy: true,
    allowedClientOrigins: ['https://relay.example'], dataDir: join(dir, 'data') };
  await writeFile(file, JSON.stringify(base));
  assert.deepEqual(readConfig(file).allowedAppOrigins, []);
  for (const allowedAppOrigins of [[], ['capacitor://localhost'], ['capacitor://localhost', 'areal-app://device']]) {
    await writeFile(file, JSON.stringify({ ...base, allowedAppOrigins }));
    assert.deepEqual(readConfig(file).allowedAppOrigins, allowedAppOrigins);
  }
  for (const allowedAppOrigins of [null, 'capacitor://localhost', {}, [null], [42],
    ...['http://localhost', 'https://localhost', 'ws://localhost', 'wss://localhost', 'HTTPS://localhost',
      'capacitor://', 'capacitor://user@localhost', 'capacitor://user:pass@localhost', 'capacitor://localhost:80',
      'capacitor://localhost:', 'capacitor://localhost/', 'capacitor://localhost/path', 'capacitor://localhost?query',
      'capacitor://localhost#fragment', 'capacitor://localhost?', 'capacitor://localhost#', ' capacitor://localhost',
      'capacitor://localhost ', 'capacitor://local\thost', 'capacitor://%6cocalhost', 'capacitor://local%68ost',
      'capacitor://localhost\\alias', 'capacitor:localhost', 'Capacitor://localhost'].map(value => [value])]) {
    await writeFile(file, JSON.stringify({ ...base, allowedAppOrigins }));
    assert.throws(() => readConfig(file), { message: 'CONFIG_APP_ORIGIN' }, JSON.stringify(allowedAppOrigins));
  }
});
