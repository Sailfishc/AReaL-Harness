'use strict';

const { setTimeout: delay } = require('node:timers/promises');

function backendURL(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Cloud 地址必须是无凭据、查询参数和片段的 HTTP(S) 地址');
  }
  url.pathname = url.pathname.replace(/\/+$/, '') + '/';
  return url;
}

/** 只管理公开平台接入；会话、历史和模型循环仍由远端 Core 持有。 */
class CloudClient {
  constructor({ baseURL, token, fetch = globalThis.fetch }) {
    this.baseURL = backendURL(baseURL);
    if (typeof token !== 'string' || !token.trim() || /[\r\n]/.test(token)) throw new Error('Cloud token 无效');
    this.token = token;
    this.fetch = fetch;
  }

  async request(method, path, body, { signal, idempotencyKey } = {}) {
    const url = new URL(path.replace(/^\//, ''), this.baseURL);
    if (url.origin !== this.baseURL.origin || !url.pathname.startsWith(this.baseURL.pathname)) throw new Error('Cloud 请求地址越界');
    let response;
    try {
      response = await this.fetch(url, {
        method, redirect: 'error',
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
        headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (cause) {
      // 不包含原始错误或请求正文，避免传输层异常回显凭据。
      throw Object.assign(new Error(signal?.aborted ? 'Cloud 请求已取消' : 'Cloud 网络请求失败；提交结果可能未知，请勿自动重发'), {
        code: signal?.aborted ? 'CLOUD_ABORTED' : 'CLOUD_TRANSPORT_ERROR', submissionUnknown: method !== 'GET',
      });
    }
    if (!response.ok) throw Object.assign(new Error(`Cloud 请求失败（HTTP ${response.status}）`), { code: 'CLOUD_HTTP_ERROR', status: response.status });
    if (response.status === 204) return null;
    try { return await response.json(); }
    catch { throw Object.assign(new Error('Cloud 返回了无效 JSON'), { code: 'CLOUD_PROTOCOL_ERROR', submissionUnknown: method !== 'GET' }); }
  }

  createSession(requestId, { signal } = {}) {
    // Harness 留空，由后端默认运行配置决定；不上传本地项目或材料。
    return this.request('POST', 'harness-sessions', {}, { signal, idempotencyKey: requestId });
  }

  async connectSession(sessionId, { signal, timeoutMs = 180_000 } = {}) {
    if (typeof sessionId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(sessionId)) throw new Error('Cloud Session ID 无效');
    const path = `harness-sessions/${sessionId}`;
    const deadline = AbortSignal.timeout(timeoutMs);
    signal = signal ? AbortSignal.any([signal, deadline]) : deadline;
    let session = await this.request('GET', path, undefined, { signal });
    if (session.state === 'STOPPED' || session.state === 'CREATED') {
      await this.request('POST', `${path}/start`, {}, { signal });
    }
    for (;;) {
      session = await this.request('GET', path, undefined, { signal });
      if (session.state === 'ACTIVE') break;
      if (!['CREATED', 'STARTING', 'ALLOCATING'].includes(session.state)) throw new Error(`Cloud Session 无法连接：${session.state}`);
      await delay(1000, undefined, { signal });
    }
    const connection = await this.request('POST', `${path}/connections`, {}, { signal });
    const endpoint = new URL(connection.endpoint, this.baseURL);
    if (endpoint.origin !== this.baseURL.origin || endpoint.username || endpoint.password || endpoint.hash) throw new Error('Cloud WebSocket 地址越界');
    if (connection.session_id !== sessionId || typeof connection.credential !== 'string' || !connection.credential) throw new Error('Cloud 连接身份无效');
    endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
    return { session, endpoint: endpoint.href, credential: connection.credential, threadStart: connection.thread_start };
  }
}

module.exports = { CloudClient, backendURL };
