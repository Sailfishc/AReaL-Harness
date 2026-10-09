'use strict';
const files = require('../workspace-files');
const git = require('@areal/workspace-git');

/** 用户直接操作的桌面文件／Git 功能，复用原有路径与 revision 校验。 */
async function workspaceCommand(backend, request) {
  const project = backend.saved.find(item => item.id === request.projectId);
  if (!project) throw new Error('未知工作区');
  switch (request.operation) {
    case 'worktreeCreate': return backend.worktrees.create(project, request);
    case 'worktreeRead': return backend.worktrees.read(project, request.requestId);
    case 'worktreeOpen': return backend.worktrees.open(project, request.requestId);
    case 'list': {
      if (typeof request.path !== 'string') throw new Error('无效目录');
      const { listDirectory } = await import('../../bridge/filetree.js');
      const result = await listDirectory(project.root, request.path, { showAll: request.showAll === true });
      if (!result) throw new Error('目录不存在或不在工作区内');
      return result;
    }
    case 'search': {
      const { searchFiles } = await import('../../bridge/filetree.js');
      return searchFiles(project.root, request.query);
    }
    case 'read': return files.readText(project.root, request.path);
    case 'save': return files.saveText(project.root, request.path, request.text, request.revision);
    case 'review': return git.review(project.root, backend.home, { scope: request.scope ?? 'unstaged', ref: request.ref });
    case 'reviewCommits': return git.reviewCommits(project.root);
    case 'reviewBranches': return git.reviewBranches(project.root);
    case 'turnReview': {
      if (typeof request.threadId !== 'string' || typeof request.turnId !== 'string') throw new Error('请选择已完成的任务轮次');
      const live = await backend.start(project.id);
      const result = await live.client.request('thread/read', { threadId: request.threadId, includeTurns: true });
      const turn = result.thread?.turns.find(turn => turn.id === request.turnId);
      if (!turn) throw new Error('轮次不属于当前任务');
      return git.reviewTurnFiles(project.root, turn, { itemId: request.itemId });
    }
    case 'status': return git.fileStatus(project.root);
    case 'info': return git.workspaceInfo(project.root, backend.home);
    case 'gitState': return git.gitState(project.root, backend.home);
    case 'gitStage':
    case 'gitUnstage':
    case 'gitCommit':
    case 'gitPush': return git.gitChange(project.root, backend.home, request);
    default: throw new Error('不支持的工作区操作');
  }
}
module.exports = { workspaceCommand };
