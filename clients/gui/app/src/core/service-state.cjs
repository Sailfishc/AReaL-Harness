// @ts-check
'use strict';
const { sameOwner } = require('./application-owner.cjs');

/** Fields already proved by the Desktop service snapshot boundary; extensions remain opaque. */
/** @typedef {{id:string,root:string,state:null|{threads:Record<string,unknown>,[key:string]:unknown},[key:string]:unknown}} ServiceProject */
/** @typedef {{projects:ServiceProject[],library:{projects:Record<string,unknown>,threads:Record<string,unknown>,settings:Record<string,unknown>,projectOrder:string[],[key:string]:unknown},[key:string]:unknown}} ServiceSnapshot */
/** @typedef {{connected:true,busy:boolean,providerUpdating:boolean,clients:number,activeCommands:number,starting:number,pid:number,applicationOwner?:unknown,[key:string]:unknown}} ServiceState */
/** @typedef {{sequence:number,snapshot:ServiceSnapshot,service:ServiceState,[key:string]:unknown}} ServicePacket */

/** @type {(packet:unknown,metadata:unknown)=>asserts packet is ServicePacket} */
const validateServicePacket = (packet, metadata) => {
  if (!servicePacket(packet, metadata)) {
    throw Object.assign(new Error('后台服务快照不受支持，原后台保持运行。请安全重启后使用本次配置。'), { code: 'SERVICE_SNAPSHOT_INVALID' });
  }
};
/** @param {unknown} packet @param {unknown} metadata @returns {packet is ServicePacket} */
function servicePacket(packet, metadata) {
  if (!record(packet) || !record(metadata)) return false;
  const snapshot = packet.snapshot, service = packet.service;
  if (!record(snapshot) || !record(snapshot.library) || !record(service)) return false;
  const library = snapshot.library;
  return count(packet.sequence) && record(library.projects) && record(library.threads) && record(library.settings)
    && Array.isArray(library.projectOrder) && library.projectOrder.every(id => typeof id === 'string')
    && Array.isArray(snapshot.projects) && snapshot.projects.every(serviceProject)
    && service.connected === true && typeof service.busy === 'boolean' && typeof service.providerUpdating === 'boolean'
    && count(service.clients) && count(service.activeCommands) && count(service.starting)
    && typeof service.pid === 'number' && Number.isSafeInteger(service.pid) && service.pid > 1 && service.pid === metadata.pid
    && ((metadata.applicationOwner === undefined && service.applicationOwner === undefined) || sameOwner(metadata.applicationOwner, service.applicationOwner));
}
/** @param {unknown} value @returns {value is ServiceProject} */
function serviceProject(value) {
  return record(value) && typeof value.id === 'string' && typeof value.root === 'string'
    && (value.state === null || record(value.state) && record(value.state.threads));
}
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
/** @param {unknown} value @returns {value is number} */
function count(value) { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }

module.exports = { validateServicePacket };
