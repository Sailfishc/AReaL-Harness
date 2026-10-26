'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { CoreBackend } = require('../app/src/core/backend.cjs');
const { CoreLibrary } = require('../app/src/core/library.cjs');
test('Cloud read marks stay local and unknown threads remain rejected', async () => {
  const backend = {
    saved: [{id:'project'}], projects: new Map(),
    lifecycleOperations: {blocking:()=>null,activeTargets:new Map(),assertProject:()=>{}},
    cloudConversations: {owns:(pid,tid)=>pid==='project' && tid==='cloud-thread'},
    save:async()=>{}, onChange:()=>{},
  };
  backend.library = new CoreLibrary(backend);
  await CoreBackend.prototype.command.call(backend, 'library', {operation:'readThread',projectId:'project',threadId:'cloud-thread',read:false});
  assert.equal(backend.library.value.threads['project:cloud-thread'].unread,true);
  await CoreBackend.prototype.command.call(backend, 'library', {operation:'readThread',projectId:'project',threadId:'cloud-thread',read:true});
  assert.equal(backend.library.value.threads['project:cloud-thread'].unread,false);
  await assert.rejects(backend.library.command({operation:'readThread',projectId:'project',threadId:'unknown',read:true}),/未知会话/);
  await assert.rejects(CoreBackend.prototype.command.call(backend,'manage',{operation:'goal',projectId:'project',threadId:'cloud-thread'}),/不支持 Cloud/);
});
