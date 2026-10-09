'use strict';

const { execFile } = require('node:child_process');
const { readFile, realpath } = require('node:fs/promises');
const { isAbsolute, resolve } = require('node:path');

// 可信桌面适配器只调用公共 CLI；不持有或终止 Core/Runtime 子进程。
function request(backend, args, environment = backend.hooks.environment()) {
  return new Promise((resolveResult, reject) => {
    execFile(backend.binary, ['service', ...args, '--json'], {
      env: environment, timeout: 120_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Core 服务请求失败：${backend.providers.redact(stderr || error.message).slice(0, 2048)}`));
        return;
      }
      try { resolveResult(JSON.parse(stdout)); }
      catch { reject(new Error('Core 返回了无效的本地服务描述')); }
    });
  });
}

async function connectService(backend, operation, args, environment, project, dataDir) {
  const descriptor = await request(backend, [operation, ...args], environment);
  const endpoint = new URL(descriptor.endpoint);
  if (descriptor.protocolVersion !== 1 || descriptor.state !== 'ready'
    || !/^[a-f0-9]{24}$/.test(descriptor.serviceId) || typeof descriptor.generation !== 'string'
    || descriptor.workspace !== await realpath(project.root)
    || descriptor.dataDir !== await realpath(dataDir)
    || endpoint.protocol !== 'ws:' || endpoint.hostname !== '127.0.0.1'
    || endpoint.username || endpoint.password || !isAbsolute(descriptor.authFile)) {
    throw new Error('Core 服务描述与当前工作区不匹配');
  }
  const auth = JSON.parse(await readFile(resolve(descriptor.authFile), 'utf8'));
  const principal = auth.principals?.find(item => ['observe', 'interact', 'manage']
    .every(permission => item.permissions?.includes(permission)));
  if (typeof principal?.token !== 'string' || !principal.token) throw new Error('Core 未提供桌面身份');
  return { descriptor, token: principal.token };
}

async function stopService(backend, project) {
  if (!project.service) return;
  const result = await request(backend, ['stop', '--instance', project.service.serviceId]);
  if (result.state !== 'stopped') throw new Error('Core 服务停止结果尚未确认');
  project.service = null;
  project.client?.close();
  project.client = null;
  project.model.connection(false);
}

module.exports = { connectService, stopService };
