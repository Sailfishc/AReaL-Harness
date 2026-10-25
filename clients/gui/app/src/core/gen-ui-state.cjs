// @ts-check
"use strict";
const { join } = require("node:path");
const { createGenUiStateStorage } = require("@areal/gen-ui/node");
/** @typedef {{id:string,root:string,state?:{threads?:Record<string,{executionProjectId?:string,worktree?:{directory?:string}}>}}} GenUiProject */
/** @param {string} home @param {GenUiProject} project @param {string} threadId */
function genUiScope(home, project, threadId) {
    const thread = project.state?.threads?.[threadId];
    const executionId = thread?.executionProjectId ?? project.id;
    const workspacePath = executionId === project.id ? project.root : thread?.worktree?.directory;
    if (!workspacePath) throw Error("执行工作区身份尚未确认");
    return { workspacePath, workspaceIdentity: `${home}:${executionId}`, sessionId: threadId };
}
/** @param {string} home */
const createGenUiState = (home) => createGenUiStateStorage(join(home, "gen-ui-state"));
module.exports = { genUiScope, createGenUiState };
