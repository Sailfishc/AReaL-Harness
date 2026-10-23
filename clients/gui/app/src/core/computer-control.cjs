const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { existsSync } = require('node:fs');
const { join } = require('node:path');
const os = require('node:os');

const INPUT_LIMIT = 1024 * 1024;
const OUTPUT_LIMIT = 32 * INPUT_LIMIT;
const READ_OPERATIONS = new Set(['describe', 'list_apps', 'list_windows', 'get_app_state', 'request_access', 'stop_computer_control']);

function controlError(code, message, possiblySent = false) {
  const error = new Error(message);
  error.code = code;
  error.actionSent = possiblySent;
  error.action_sent = possiblySent;
  error.dispatchStatus = possiblySent ? 'possibly_sent' : 'not_sent';
  error.dispatch_status = error.dispatchStatus;
  error.structuredContent = { code, message, action_sent: possiblySent, dispatch_status: error.dispatchStatus };
  return error;
}

class ComputerControl {
  constructor({ helperPath, getEnabled = () => false, onActivity = () => {} }) {
    this.helperPath = helperPath;
    this.getEnabled = getEnabled;
    this.onActivity = onActivity;
    this.child = null;
    this.retiring = null;
    this.pending = new Map();
    this.closed = false;
    this.activity = { active: false, activeTarget: null, heldKeys: 0, heldButtons: 0 };
    this.unsupported = process.platform !== 'darwin' || Number(os.release().split('.')[0]) < 23;
  }

  async status() {
    const enabled = this.getEnabled() === true;
    if (this.unsupported) return { available: false, enabled, platform: process.platform, ready: false,
      accessibility: 'unknown', screenRecording: 'unknown', reason: 'Native computer control requires macOS 14 or later' };
    try {
      const value = await this._rpc('status', {}, { timeoutMs: 5_000 });
      return { ...value, enabled, ready: enabled && value.ready === true };
    } catch (error) {
      return { available: false, enabled, platform: process.platform, ready: false,
        accessibility: 'unknown', screenRecording: 'unknown', reason: error.message, code: error.code };
    }
  }

  requestAccess(capability) {
    if (!['accessibility', 'screenRecording', 'inputMonitoring'].includes(capability)) {
      return Promise.reject(controlError('invalid_request', 'Unknown computer permission capability'));
    }
    return this._rpc('requestAccess', { capability }, { timeoutMs: 120_000 });
  }

  prepare(request) {
    if (request?.arguments?.operation !== 'stop_computer_control') this._requireEnabled();
    return this._rpc('prepare', this._request(request), { signal: request.signal, timeoutMs: 15_000 });
  }

  execute(request) {
    const operation = request?.arguments?.operation;
    if (operation !== 'stop_computer_control') this._requireEnabled();
    if (!request?.computerApproval?.plan) return Promise.reject(controlError('not_authorized', 'A prepared computer approval is required'));
    const mutation = !READ_OPERATIONS.has(operation);
    return this._rpc('execute', this._request(request), { signal: request.signal, timeoutMs: 35_000, mutation });
  }

  async stop(reason = 'Stopped by user') {
    if (!this.child) return { ...this.activity, active: false, stopped: true };
    try { return await this._rpc('stop', { reason: String(reason).slice(0, 1024) }, { timeoutMs: 2_000 }); }
    catch (error) { this._terminate(error); throw error; }
  }

  async restart() {
    await this._shutdown('Helper restarted');
    this.closed = false;
    return this.status();
  }

  async close() {
    this.closed = true;
    await this._shutdown('Host closed');
  }

  _requireEnabled() {
    if (this.getEnabled() !== true) {
      void this.stop('Computer control disabled').catch(() => {});
      throw controlError('not_authorized', 'Computer control is disabled in Settings');
    }
  }

  _request(request) {
    if (!request || typeof request !== 'object') throw controlError('invalid_request', 'Missing trusted computer request');
    const result = {};
    for (const key of ['coreInstanceId', 'coreGeneration', 'projectId', 'threadId', 'turnId', 'callId', 'toolHostGeneration', 'arguments', 'computerApproval', 'phase']) {
      if (request[key] !== undefined) result[key] = request[key];
    }
    return result;
  }

  _start() {
    if (this.unsupported) throw controlError('broker_unavailable', 'Native computer control requires macOS 14 or later');
    if (this.child) return this.child;
    if (this.retiring) throw controlError('broker_unavailable', 'The previous computer helper is still shutting down');
    if (this.closed) throw controlError('broker_unavailable', 'Computer helper is closed');
    const executable = this.helperPath?.endsWith('.app') ? join(this.helperPath, 'Contents/MacOS/AReaLComputerHelper') : this.helperPath;
    if (!executable || !existsSync(executable)) throw controlError('broker_unavailable', 'AReaL Computer Helper is not built or packaged');
    const child = spawn(executable, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
      env: { PATH: '/usr/bin:/bin', HOME: os.homedir(), TMPDIR: os.tmpdir(), LANG: process.env.LANG || 'en_US.UTF-8' } });
    this.child = child;
    let buffer = Buffer.alloc(0);
    let stderr = '';
    child.stdout.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      let boundary;
      while ((boundary = buffer.indexOf(10)) !== -1) {
        if (boundary > OUTPUT_LIMIT) { this._terminate(controlError('broker_unavailable', 'Helper response exceeds its byte limit')); return; }
        const line = buffer.subarray(0, boundary);
        buffer = buffer.subarray(boundary + 1);
        let message;
        try { message = JSON.parse(line.toString('utf8')); }
        catch { this._terminate(controlError('broker_unavailable', 'Malformed private helper response')); return; }
        if (message.event === 'activity') {
          this.activity = { ...message.status, app: message.status?.app ?? message.status?.activeTarget ?? null };
          try { this.onActivity(this.activity); } catch {}
          continue;
        }
        const pending = this.pending.get(message.id);
        if (!pending || pending.child !== child) continue;
        this.pending.delete(message.id); pending.cleanup();
        if (message.ok === true) pending.resolve(message.result);
        else {
          const value = message.error || {};
          pending.reject(controlError(value.code || 'internal', value.message || 'Computer helper request failed', value.dispatch_status === 'possibly_sent' || value.action_sent === true));
        }
      }
      if (buffer.length > OUTPUT_LIMIT) this._terminate(controlError('broker_unavailable', 'Helper response exceeds its byte limit'));
    });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString('utf8')).slice(-4096); });
    child.on('error', error => this._lost(child, `Could not launch computer helper: ${error.message}`));
    child.on('close', (code, signal) => {
      if (this.retiring === child) this.retiring = null;
      this._lost(child, `Computer helper exited (${signal || code})${stderr ? `: ${stderr.trim()}` : ''}`);
    });
    child.stdin.on('error', error => { if (this.child === child) this._terminate(controlError('broker_unavailable', `Computer helper input closed: ${error.message}`)); });
    return child;
  }

  _rpc(method, params, { timeoutMs = 15_000, signal, mutation = false } = {}) {
    if (signal?.aborted) return Promise.reject(controlError('control_stopped', 'Computer request was cancelled before dispatch'));
    let child;
    try { child = this._start(); } catch (error) { return Promise.reject(error); }
    if (this.pending.size >= 32 && !['stop', 'status'].includes(method)) return Promise.reject(controlError('controller_busy', 'Computer helper request queue is full'));
    const id = randomUUID();
    let data;
    try { data = Buffer.from(`${JSON.stringify({ id, method, params })}\n`); }
    catch { return Promise.reject(controlError('invalid_request', 'Computer request is not JSON serializable')); }
    if (data.length > INPUT_LIMIT) return Promise.reject(controlError('invalid_request', 'Computer request exceeds its byte limit'));
    return new Promise((resolve, reject) => {
      let cancellationTimer;
      const fail = (code, message) => {
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id); pending.cleanup(); reject(controlError(code, message, mutation));
      };
      const abort = () => {
        void this.stop('Core cancelled computer operation').catch(() => {});
        cancellationTimer = setTimeout(() => fail('control_stopped', 'Computer operation cancellation could not establish its effect'), 1_500);
        cancellationTimer.unref?.();
      };
      const timer = setTimeout(() => {
        if (method !== 'stop' && method !== 'status') void this.stop('Computer operation deadline exceeded').catch(() => {});
        fail('timeout', 'Computer operation deadline exceeded; do not replay an action that may have been sent');
      }, timeoutMs);
      timer.unref?.();
      const cleanup = () => { clearTimeout(timer); clearTimeout(cancellationTimer); signal?.removeEventListener('abort', abort); };
      this.pending.set(id, { child, resolve, reject, cleanup, mutation });
      signal?.addEventListener('abort', abort, { once: true });
      child.stdin.write(data, error => { if (error) fail('broker_unavailable', error.message); });
    });
  }

  _lost(child, message) {
    const current = this.child === child;
    if (current) this.child = null;
    for (const [id, pending] of this.pending) {
      if (pending.child !== child) continue;
      this.pending.delete(id); pending.cleanup();
      pending.reject(controlError('broker_unavailable', message, pending.mutation));
    }
    if (current) {
      this.activity = { active: false, activeTarget: null, app: null, reason: message };
      try { this.onActivity(this.activity); } catch {}
    }
  }

  _terminate(error) {
    const child = this.child;
    if (!child) return;
    this.retiring = child;
    child.kill('SIGTERM');
    this._lost(child, error.message);
    const kill = setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }, 1_000);
    kill.unref?.();
  }

  async _shutdown(reason) {
    const child = this.child;
    if (!child) return;
    try { await this.stop(reason); } catch {}
    child.stdin.end();
    await new Promise(resolve => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve();
      const timer = setTimeout(() => { this._terminate(controlError('broker_unavailable', reason)); resolve(); }, 1_500);
      child.once('close', () => { clearTimeout(timer); resolve(); });
    });
  }
}

module.exports = { ComputerControl };
