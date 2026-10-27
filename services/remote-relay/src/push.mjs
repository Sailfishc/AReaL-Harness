import { connect as connectHttp2 } from 'node:http2';
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const exact = (value, names) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => names.includes(key));
const bounded = (value, max) => typeof value === 'string' && value.length > 0 && Buffer.byteLength(value) <= max;
export function isPushRequest(value) {
  return exact(value, ['type', 'token', 'environment', 'collapseId', 'kind', 'count', 'target']) &&
    value.type === 'push' && typeof value.token === 'string' && /^[a-fA-F0-9]{64,200}$/.test(value.token) &&
    ['production', 'development'].includes(value.environment) && bounded(value.collapseId, 64) &&
    ['attention', 'turnCompleted', 'turnFailed'].includes(value.kind) && Number.isSafeInteger(value.count) && value.count > 0 &&
    (value.target === undefined || (exact(value.target, ['projectId', 'threadId', 'attentionRef']) && Object.values(value.target).every(id => bounded(id, 256))));
}

export function createPush(config, { connect = connectHttp2, now = Date.now } = {}) {
  const key = createPrivateKey(readFileSync(config.keyFile));
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw new Error('CONFIG_APNS_KEY');
  const sessions = new Map(); const activeSessions = new Set(); const counters = new Map();
  let minute = Math.floor(now() / 60000); let issuedAt = -Infinity; let jwt; let inflight = 0; let closed = false;
  function authorization() {
    if (now() - issuedAt >= 50 * 60000) {
      const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: config.keyId })).toString('base64url');
      const claims = Buffer.from(JSON.stringify({ iss: config.teamId, iat: Math.floor(now() / 1000) })).toString('base64url');
      const unsigned = `${header}.${claims}`;
      jwt = `${unsigned}.${sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
      issuedAt = now();
    }
    return `bearer ${jwt}`;
  }
  function sessionFor(environment) {
    const origin = environment === 'production' ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com';
    const existing = sessions.get(origin);
    if (existing && !existing.closed && !existing.destroyed) return existing;
    const session = connect(origin); sessions.set(origin, session); activeSessions.add(session);
    session.on('error', () => {});
    session.once('close', () => { activeSessions.delete(session); if (sessions.get(origin) === session) sessions.delete(origin); });
    session.once('goaway', () => { if (sessions.get(origin) === session) sessions.delete(origin); session.close(); });
    return session;
  }
  return {
    async send(room, message) {
      if (closed) return { code: 'UNAVAILABLE' };
      const current = Math.floor(now() / 60000);
      if (current !== minute) { counters.clear(); minute = current; }
      const count = counters.get(room) ?? 0;
      if (count >= config.maxPerHostPerMinute || inflight >= 32) return { code: 'LIMIT_EXCEEDED' };
      counters.set(room, count + 1); inflight++;
      try {
        const session = sessionFor(message.environment);
        const body = message.kind === 'attention' ? `电脑上有 ${message.count} 项需要你确认` : message.kind === 'turnCompleted' ? '你在手机上发起的会话已完成' : '你在手机上发起的会话没有完成';
        const payload = JSON.stringify({ aps: { alert: { title: 'AReaL', body }, sound: 'default' }, ...(message.target === undefined ? {} : { target: message.target }) });
        const stream = session.request({ ':method': 'POST', ':path': `/3/device/${message.token}`,
          authorization: authorization(), 'apns-topic': config.bundleId, 'apns-push-type': 'alert', 'apns-priority': '10', 'apns-collapse-id': message.collapseId });
        return await new Promise(resolve => {
          let status = 0; let bytes = 0; const chunks = [];
          const deadline = setTimeout(() => { stream.destroy(); if (session.connecting) session.destroy(); finish({ status: 0 }); }, 10000); deadline.unref();
          function finish(result) { clearTimeout(deadline); resolve(result); }
          stream.on('response', headers => { status = Number(headers[':status']) || 0; });
          stream.on('data', chunk => { bytes += chunk.length; if (bytes <= 2048) chunks.push(chunk); else stream.destroy(); });
          stream.once('error', () => finish({ status: 0 }));
          stream.once('close', () => finish({ status: 0 }));
          stream.once('end', () => {
            let unregistered = false;
            if (status === 410) {
              try { unregistered = JSON.parse(Buffer.concat(chunks).toString('utf8')).reason === 'Unregistered'; } catch {}
            }
            finish({ status, unregistered });
          });
          stream.end(payload);
        });
      } catch { return { status: 0 }; }
      finally { inflight--; }
    },
    close() { closed = true; for (const session of activeSessions) session.destroy(); sessions.clear(); activeSessions.clear(); counters.clear(); },
  };
}
