// @ts-check
'use strict';

/** @typedef {{id?:string,projectId?:string,threadId?:string,connectionGeneration?:number,code:unknown,reason?:unknown,message:string,retryable:boolean,refreshPending?:boolean,recovery?:import('@areal/runtime-client/core').Recovery}} ObservationError */
/** @typedef {{id:string,projectId:string,connectionGeneration?:number,operation?:import('@areal/runtime-client/core').OperationRef,scope?:string,message:string,refreshPending:boolean}} RefreshError */
/** @typedef {{client:import('@areal/runtime-client/core').CoreClient|null|undefined,generation?:number,id:string,promise:Promise<void>}} ObservationRead */
/** @typedef {PendingSubmission & {operationId:string,remote:RemoteAssociation}} RemotePending */
/** @typedef {(PendingSubmission|SubmissionOutcome) & {method:string,operationId:string,remote:RemoteAssociation}} RemoteRecord */
/** @typedef {{client:import('@areal/runtime-client/core').CoreClient,generation?:number,deadline:number,attempt:number,running:boolean,timer?:NodeJS.Timeout|null}} Reconciliation */
/** The mutable Desktop projection; durable execution facts stay in Core. */
/** @typedef {Record<string,unknown> & {requestId?:string,threadId?:string,taskId?:string,sourceThreadId?:string,parentThreadId?:string,turnId?:string,expectedTurnId?:string,expectedRevision?:number,previousItems?:unknown[],input?:unknown[]}} SubmissionParams */
/** @typedef {Record<string,unknown> & {method:string,capability:string,semanticDigest:string,target:Record<string,unknown>}} RemoteAssociation */
/** @typedef {Record<string,unknown> & {method:string,params:SubmissionParams,operation?:import('@areal/runtime-client/core').OperationRef,operationId?:string,remote?:RemoteAssociation}} PendingSubmission */
/** @typedef {Record<string,unknown> & {method?:string,status?:string,operationId?:string,operation?:import('@areal/runtime-client/core').OperationRef,remote?:RemoteAssociation,accepted?:boolean,threadId?:string,turnId?:string,taskId?:string,parentThreadId?:string,sourceThreadId?:string,workgroupId?:string}} SubmissionOutcome */
/** @typedef {import('./project-index.cjs').SavedProject & {
 * model:import('@areal/workbench/core-model').CoreTaskModel,
 * pending:PendingSubmission[],pendingWrite?:Promise<unknown>,outcomeWrite?:Promise<void>,reconciliation?:Reconciliation|null,reconciliationRead?:{client:import('@areal/runtime-client/core').CoreClient|null|undefined,generation?:number,promise:Promise<void>}|null,outcomes:Record<string,SubmissionOutcome>,
 * configurations:Record<string,unknown>,configurationChanges:Map<string,Promise<unknown>>,
 * models?:unknown,profiles?:unknown,resourceProfile?:unknown,resourceFingerprint?:unknown,providerRevision?:unknown,providerSnapshot?:unknown,summariesLoaded?:boolean,
 * observationErrors?:Record<string,ObservationError>,refreshErrors?:Record<string,RefreshError>,
 * observationReads?:Map<string,ObservationRead>,summaryReads?:Promise<void|import('@areal/workbench/core-model-contract').CoreThread[]>,
 * taskNotificationMonitor?:InstanceType<typeof import('./notifications.cjs').TaskNotificationMonitor>,taskViews?:Map<string,string>,
 * error:string|null,summaries:import('../../../packages/workbench/client/core-model-contract.js').CoreThread[],
 * service?:(import('./local-service.cjs').RecoveryTarget & {endpoint?:string,owner?:unknown,hostPid?:unknown,corePid?:unknown})|null,resourceInitializing?:boolean,endpoint?:string|null,token?:string,connectionGeneration?:number,
 * reconnectTimer?:NodeJS.Timeout|null,reconnectBlocked?:boolean,reconnectAttempt?:number,
 * crashCheck?:{generation:string,started:number},crashAttempts?:number[],crashRecovery?:{original:import('./local-service.cjs').RecoveryTarget,calls:number},journalLoaded?:boolean,client?:import('@areal/runtime-client/core').CoreClient|null,hookRevision?:string|null
 * }} CoreProject */

/** @param {import('./project-index.cjs').SavedProject} saved @param {import('@areal/workbench/core-model').CoreTaskModel} model @returns {CoreProject} */
function createProjectState(saved, model) {
  return { ...saved, model, pending: [], outcomes: {}, configurations: {},
    configurationChanges: new Map(), error: null, summaries: [] };
}

/** @param {unknown} value @returns {PendingSubmission[]} */
function parsePendingSubmissions(value) {
  if (!Array.isArray(value) || !value.every(isPendingSubmission)) throw new Error('Invalid pending submission journal');
  return value;
}
/** @param {unknown} value @returns {Record<string,SubmissionOutcome>} */
function parseSubmissionOutcomes(value) {
  if (!isSubmissionOutcomes(value)) throw new Error('Invalid submission outcome journal');
  return value;
}
/** @param {unknown} value @returns {value is Record<string,SubmissionOutcome>} */
function isSubmissionOutcomes(value) { return record(value) && Object.values(value).every(isSubmissionOutcome); }
/** @param {unknown} value @returns {value is PendingSubmission} */
function isPendingSubmission(value) {
  return record(value) && typeof value.method === 'string' && isSubmissionParams(value.params)
    && (value.operation === undefined || isOperationRef(value.operation))
    && (value.operationId === undefined || typeof value.operationId === 'string')
    && (value.remote === undefined || isRemoteAssociation(value.remote) && typeof value.operationId === 'string' && typeof value.method === 'string');
}
/** @param {unknown} value @returns {value is SubmissionParams} */
function isSubmissionParams(value) {
  return record(value) && ['requestId','threadId','taskId','sourceThreadId','parentThreadId','turnId','expectedTurnId'].every(key => value[key] === undefined || typeof value[key] === 'string')
    && (value.expectedRevision === undefined || typeof value.expectedRevision === 'number')
    && (value.previousItems === undefined || Array.isArray(value.previousItems))
    && (value.input === undefined || Array.isArray(value.input));
}
/** @param {unknown} value @returns {value is SubmissionOutcome} */
function isSubmissionOutcome(value) {
  return record(value) && ['method','status','operationId','threadId','turnId','taskId','parentThreadId','sourceThreadId','workgroupId'].every(key => value[key] === undefined || typeof value[key] === 'string')
    && (value.accepted === undefined || typeof value.accepted === 'boolean')
    && (value.operation === undefined || isOperationRef(value.operation))
    && (value.remote === undefined || isRemoteAssociation(value.remote) && typeof value.operationId === 'string' && typeof value.method === 'string');
}
/** @param {unknown} value @returns {value is import('@areal/runtime-client/core').OperationRef} */
function isOperationRef(value) {
  if (!record(value) || typeof value.method !== 'string' || value.requestId !== undefined && typeof value.requestId !== 'string' || !record(value.target)) return false;
  return value.target.kind === 'project' || value.target.kind === 'thread' && typeof value.target.threadId === 'string'
    || value.target.kind === 'task' && typeof value.target.taskId === 'string';
}
/** @param {PendingSubmission|SubmissionOutcome} value @returns {value is RemoteRecord} */
function isRemoteRecord(value) { return typeof value.method === 'string' && typeof value.operationId === 'string' && value.remote !== undefined; }
/** @param {unknown} value @returns {value is RemoteAssociation} */
function isRemoteAssociation(value) { return record(value) && typeof value.method === 'string' && typeof value.capability === 'string' && typeof value.semanticDigest === 'string' && record(value.target); }
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }

module.exports = { createProjectState, parsePendingSubmissions, parseSubmissionOutcomes, isSubmissionParams, isOperationRef, isRemoteAssociation, isPendingSubmission, isRemoteRecord };
