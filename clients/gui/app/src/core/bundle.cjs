'use strict';

const { createHash } = require('node:crypto');
const { existsSync, readFileSync, lstatSync } = require('node:fs');
const { isAbsolute, join } = require('node:path');

const executablePaths = { areal: 'bin/areal', 'areal-runtime': 'libexec/areal/areal-runtime',
  'areal-runtime-fs': 'libexec/areal/areal-runtime-fs' };
const executables = Object.keys(executablePaths);

// 内置工具与许可必须完整随包导入。
function coreBundleFiles(manifest) {
  const tools = Object.keys(manifest.files ?? {}).filter(path => path.startsWith('libexec/areal/tools/'));
  for (const path of tools) {
    if (!/^libexec\/areal\/tools\/[A-Za-z0-9._+/-]+$/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..')) {
      throw new Error('Core 工具清单路径无效');
    }
  }
  if ((!tools.includes('libexec/areal/tools/rg') || !tools.includes('libexec/areal/tools/rg.json') || !tools.some(path => path.startsWith('libexec/areal/tools/licenses/')))) {
    throw new Error('Core 内置工具或许可证清单不完整');
  }
  return [...Object.values(executablePaths), ...tools.sort()];
}

function bundleRoot(resourcesPath) {
  return join(resourcesPath, 'areal-core');
}

function verifyCoreBundle(resourcesPath, { platform = process.platform, arch = process.arch, hashes = false } = {}) {
  const root = bundleRoot(resourcesPath);
  let manifest;
  try { manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')); }
  catch (error) { throw new Error(`安装包缺少有效的 AReaL Core manifest：${error.message}`); }
  if (manifest.manifestVersion !== 1 || manifest.apiVersion !== 'areal.core.v1'
    || manifest.platform !== `${platform}/${arch}` || typeof manifest.files !== 'object') {
    throw new Error('安装包内 AReaL Core 与当前平台或协议不匹配');
  }
  if (!Number.isInteger(manifest.stateVersion) || manifest.stateVersion < 12) {
    throw new Error('安装包内 AReaL Core 版本无法读取现有桌面会话');
  }
  const paths = {};
  for (const name of executables) {
    const relative = executablePaths[name];
    const path = join(root, relative);
    if (!existsSync(path) || !/^[a-f0-9]{64}$/.test(manifest.files[relative] ?? '')) {
      throw new Error(`安装包缺少 AReaL Core 组件 ${name}`);
    }
    if (hashes) {
      const actual = createHash('sha256').update(readFileSync(path)).digest('hex');
      if (actual !== manifest.files[relative]) throw new Error(`AReaL Core 组件校验失败：${name}`);
    }
    paths[name] = path;
  }
  for (const relative of coreBundleFiles(manifest).filter(path => path.startsWith('libexec/areal/tools/'))) {
    const path = join(root, relative);
    if (!existsSync(path) || !lstatSync(path).isFile() || !/^[a-f0-9]{64}$/.test(manifest.files[relative] ?? '')) throw new Error(`安装包缺少 Core 工具资源 ${relative}`);
    if (hashes && createHash('sha256').update(readFileSync(path)).digest('hex') !== manifest.files[relative]) throw new Error(`Core 工具资源校验失败：${relative}`);
  }
  return { root, manifest, paths };
}

function resolveCoreBinary({ explicit, packaged, resourcesPath, platform = process.platform, arch = process.arch } = {}) {
  if (explicit) {
    if (!isAbsolute(explicit)) throw new Error('AREAL_CORE_BIN 必须是绝对路径');
    return explicit;
  }
  if (!packaged || !resourcesPath) throw new Error('请设置 AREAL_CORE_BIN 为 areal 可执行文件的绝对路径');
  return verifyCoreBundle(resourcesPath, { platform, arch }).paths.areal;
}

module.exports = { coreBundleFiles, bundleRoot, executablePaths, executables, resolveCoreBinary, verifyCoreBundle };
