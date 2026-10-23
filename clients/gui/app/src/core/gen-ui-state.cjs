"use strict";
const { join } = require("node:path");
const { createGenUiStateStorage } = require("@areal/gen-ui/node");
function genUiScope(home, project, threadId) {
    return { workspacePath: project.root, workspaceIdentity: `${home}:${project.id}`, sessionId: threadId };
}
const createGenUiState = home => createGenUiStateStorage(join(home, "gen-ui-state"));
module.exports = { genUiScope, createGenUiState };
