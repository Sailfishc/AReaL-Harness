import {useEffect, useRef, useState} from 'react';
import { useCloudEnvironment } from './cloudEnvironment.js';
import { Cloud } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from './components/ui/dropdown-menu.js';
import {WorkspaceLocalIcon} from './homeChromeIcons.js';
import type {Action, Data} from './services.js';

// Read-only projection of the public Desktop workspace owner. This does not
// select a branch, create a worktree or infer execution facts from UI state.
export function ComposerWorkspaceContext({project,action,cloud=false,selectable=false}:{project:Data;action:Action;cloud?:boolean;selectable?:boolean}) {
  const choice = useCloudEnvironment(project, action);
  const inCloud = cloud || (selectable && choice.environment === "cloud");
  const owner=JSON.stringify([project.id,project.root,!!project.state?.connected]);
  const request=useRef(action);request.current=action;
  const [result,setResult]=useState<{owner:string;info?:Data;error?:string}>();
  useEffect(()=>{
    if(!project.state?.connected)return;
    let active=true;
    void request.current('workspace',{projectId:project.id,operation:'info'}).then(
      info=>{if(active)setResult({owner,info});},
      error=>{if(active)setResult({owner,error:(error as Error).message});},
    );
    return ()=>{active=false;};
  },[owner]);
  const current=result?.owner===owner?result:undefined;
  return <div className="composer-workspace-context" role="group" aria-label="工作区上下文">
    {selectable && choice.available ? <DropdownMenu>
      <DropdownMenuTrigger render={<button type="button" className="composer-workspace-location" aria-label="会话运行环境">{inCloud ? <Cloud size={16}/> : <WorkspaceLocalIcon/>}{inCloud ? 'Cloud' : '本地'}</button>} />
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => choice.select('local')}><WorkspaceLocalIcon/>本地</DropdownMenuItem>
        <DropdownMenuItem onClick={() => choice.select('cloud')}><Cloud size={16}/>Cloud</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu> : inCloud ? <span className="composer-workspace-location"><Cloud size={16}/>Cloud</span> : null}
    {inCloud ? null : !project.state?.connected?<span>{project.error || project.state?.error ? '未连接' : '正在连接…'}</span>:
      current?.error?<span title={current.error}>工作区信息不可用</span>:
      !current?.info?<span>读取工作区…</span>:<>
        {!(selectable && choice.available) && <span className="composer-workspace-location"><WorkspaceLocalIcon/>{current.info.target?'工作树':'本地'}</span>}
        {current.info.git!==false&&current.info.branch&&<span className="composer-workspace-branch" aria-label="当前分支" title={current.info.branch}>
          <span>{current.info.branch==='(detached)'?'分离的 HEAD':current.info.branch}</span>
        </span>}
      </>}
  </div>;
}
