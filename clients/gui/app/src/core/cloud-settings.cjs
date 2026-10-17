'use strict';

const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { backendURL, CloudClient } = require('./cloud-client.cjs');

/** Renderer 只读配置状态；token 只在可信适配器解密用于目标后端。 */
class CloudSettings {
  constructor(backend, encryption) {
    this.backend = backend;
    this.encryption = encryption;
    this.chain = Promise.resolve();
  }
  async record() {
    try { return JSON.parse(await readFile(join(this.backend.home, 'cloud.json'), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return {}; throw new Error('无法读取 Cloud 配置'); }
  }
  checkStorage() {
    if (!this.encryption?.isEncryptionAvailable() || this.encryption.getSelectedStorageBackend?.() === 'basic_text') throw new Error('系统安全存储不可用，请解锁后重试');
  }
  async status() {
    const record = await this.record();
    return { baseURL: record.baseURL ?? '', tokenConfigured: !!record.secret };
  }
  command(request) {
    if (request?.operation === 'status') return this.status();
    if (request?.operation !== 'save') throw new Error('不支持的 Cloud 配置操作');
    const operation = this.chain.then(async () => {
      const previous = await this.record();
      const baseURL = backendURL(request.baseURL).href.replace(/\/$/, '');
      if (request.token !== undefined && typeof request.token !== 'string') throw new Error('Cloud token 无效');
      let secret;
      if (request.token) {
        if (!request.token.trim() || /[\r\n]/.test(request.token) || request.token.length > 16384) throw new Error('Cloud token 无效');
        this.checkStorage();
        secret = this.encryption.encryptString(request.token).toString('base64');
      } else if (previous.baseURL === baseURL) secret = previous.secret;
      // 地址改变时必须重新提供token，不能把旧目标的凭据自动发送到新目标。
      if (!secret) throw new Error('请为此 Cloud 地址提供 token');
      await this.backend.save('cloud.json', { baseURL, secret });
      return { baseURL, tokenConfigured: true };
    });
    this.chain = operation.catch(() => {});
    return operation;
  }
  async client() {
    const record = await this.record();
    if (!record.baseURL || !record.secret) throw new Error('请先配置 Cloud 地址和 token');
    this.checkStorage();
    let token;
    try { token = this.encryption.decryptString(Buffer.from(record.secret, 'base64')); }
    catch { throw new Error('无法解密 Cloud token，请重新保存'); }
    return new CloudClient({ baseURL: record.baseURL, token });
  }
}

module.exports = { CloudSettings };
