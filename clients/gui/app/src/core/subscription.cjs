// @ts-check
'use strict';
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');

// Same serialized credential-store contract as the existing OAuth owner.
class SubscriptionStore {
  /** @param {{home:string,save:(name:string,value:unknown)=>Promise<void>}} backend @param {import("electron").SafeStorage} [encryption] */
  constructor(backend, encryption) {
    this.filename = 'openai-subscription.json'; this.backend = backend; this.encryption = encryption;
    /** @type {Promise<unknown>} */
    this.chain = Promise.resolve();
  }
  /** @returns {asserts this is this & {encryption:import("electron").SafeStorage}} */
  check() {
    if (!this.encryption?.isEncryptionAvailable() || this.encryption.getSelectedStorageBackend?.() === 'basic_text') throw Object.assign(new Error('系统安全存储不可用，请解锁后重试'), { code: 'storage_locked' });
  }
  /** @returns {Promise<unknown>} */
  async readRecord() {
    try {
      const record = JSON.parse(await readFile(join(this.backend.home, this.filename), 'utf8'));
      if (!record.secret) return undefined;
      this.check();
      return JSON.parse(this.encryption.decryptString(Buffer.from(record.secret, 'base64')));
    } catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined; throw Object.assign(new Error('无法读取 ChatGPT 登录，请解锁系统安全存储后重试'), { code: 'storage_locked' }); }
  }
  /** @param {unknown} _key @param {(current:unknown)=>unknown|Promise<unknown>} mutate */
  modifyRecord(_key, mutate) {
    const result = this.chain.then(async () => {
      const current = await this.readRecord(), next = await mutate(current);
      if (next === undefined) return current;
      this.check();
      try { await this.backend.save(this.filename, { secret: this.encryption.encryptString(JSON.stringify(next)).toString('base64') }); }
      catch { throw Object.assign(new Error('ChatGPT 凭据轮换尚未保存，请重试'), { code: 'storage_write_failed' }); }
      return next;
    });
    this.chain = result.catch(() => {}); return result;
  }
  deleteRecord() {
    const result = this.chain.then(() => this.backend.save(this.filename, { secret: null }));
    this.chain = result.catch(() => {}); return result;
  }
}
module.exports = { SubscriptionStore };
