import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const gui=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(join(gui,'app/package.json'));
const {manageTask,taskOperations}=require('../app/src/core/tasks.cjs');
async function boundaryContract(){
 for(const operation of ['taskHistoryCapabilities','taskRuns','taskRun'])assert.ok(taskOperations.has(operation),`${operation} is a narrow desktop capability`);
 const calls=[],client={capabilities:{methods:['areal/task/runs/list','areal/task/run/read']},request:async(method,params)=>{calls.push({method,params});return {method,params};}};
 const project={client},backend={requireConnection:(_project,value)=>assert.equal(value,client)};
 assert.deepEqual(await manageTask(backend,project,{operation:'taskHistoryCapabilities'}),{enabled:true});
 await manageTask(backend,project,{operation:'taskRuns',taskId:'task',cursor:'opaque-page',limit:100,arbitraryMethod:'bad'});
 assert.deepEqual(calls.at(-1),{method:'areal/task/runs/list',params:{taskId:'task',cursor:'opaque-page',limit:100}});
 await manageTask(backend,project,{operation:'taskRun',taskId:'task',runId:'old-run'});
 assert.deepEqual(calls.at(-1),{method:'areal/task/run/read',params:{taskId:'task',runId:'old-run'}});
 for(const request of [{operation:'taskRuns',taskId:'task',limit:0},{operation:'taskRuns',taskId:'task',limit:101},{operation:'taskRuns',taskId:'task',cursor:7},{operation:'taskRun',taskId:'task'}])await assert.rejects(()=>manageTask(backend,project,request));
 client.capabilities.methods=[];
 assert.deepEqual(await manageTask(backend,project,{operation:'taskHistoryCapabilities'}),{enabled:false});
 await assert.rejects(()=>manageTask(backend,project,{operation:'taskRuns',taskId:'task'}));
 console.log('PASS narrow task history adapter contract; Core/Electron not exercised');
}
await boundaryContract();
if(process.argv.includes('--boundary-only'))process.exit(0);
const {_electron:electron}=require('playwright-core');
const binary=process.env.AREAL_CORE_BIN||resolve(gui,'../../target/debug/areal');
const binarySha256=createHash('sha256').update(await readFile(binary)).digest('hex');
const evidenceRoot=process.env.AREAL_TASK_HISTORY_EVIDENCE||'/private/tmp';
await mkdir(evidenceRoot,{recursive:true});
const scratch=await mkdtemp(join(evidenceRoot,'task-history-'));
const workspace=join(scratch,'workspace'),userHome=join(scratch,'user');
await mkdir(workspace);await mkdir(join(userHome,'.areal'),{recursive:true});
execFileSync('git',['init','-b','main'],{cwd:workspace,stdio:'ignore'});
await writeFile(join(userHome,'.areal/config.toml'),'schema_version=1\n[model]\nprovider="fixture"\nname="fixture"\n[model.providers.fixture]\nprotocol="chat-completions"\nendpoint="http://127.0.0.1:9/v1/chat/completions"\n[permissions]\nmode="YOLO"\n');
const env={...process.env,AREAL_GUI_USER_DATA:join(scratch,'electron'),AREAL_CORE_HOME:join(scratch,'core'),AREAL_CORE_USER_HOME:userHome,AREAL_HARNESS_SERVICE_HOME:join(scratch,'registry'),AREAL_CORE_BIN:binary};
for(const key of ['AREAL_CORE_WORKSPACE','AREAL_CORE_CONFIG','AREAL_HARNESS_HOME','AREAL_HARNESS_CONFIG','AREAL_CORE_DESKTOP_CONFIG'])delete env[key];
const fixtureApp=join(scratch,'app');await mkdir(fixtureApp);
await writeFile(join(fixtureApp,'package.json'),JSON.stringify({name:'task-history-fixture',main:'bootstrap.cjs'}));
await writeFile(join(fixtureApp,'bootstrap.cjs'),`
const service=require(${JSON.stringify(join(gui,'app/src/core/service-client.cjs'))});
const Backend=service.SharedCoreBackend;
service.SharedCoreBackend=class extends Backend { constructor(options) { super(options); global.taskHistoryNotificationOpen=options.onNotificationOpen; } };
require(${JSON.stringify(join(gui,'app/src/main.cjs'))});
`);
const checks=[],errors=[];
let app,page,pid,taskId,coldThreadId,passed=false;
async function until(fn,label,timeout=60000){const end=Date.now()+timeout;while(Date.now()<end){const value=await fn();if(value)return value;await new Promise(resolve=>setTimeout(resolve,100));}throw Error(`Timeout: ${label}`);}
const snapshot=()=>page.evaluate(()=>window.arealDesktop.snapshot());
async function call(name,params){const reply=await page.evaluate(({name,params})=>window.arealDesktop.command(name,params),{name,params});assert.equal(reply.ok,true,JSON.stringify(reply));return reply.value;}
async function launch(){
 app=await electron.launch({executablePath:process.env.AREAL_ELECTRON_EXECUTABLE||require('electron'),args:[fixtureApp],env,timeout:120000});
 page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
 await page.getByTestId('areal-workbench').waitFor({timeout:120000});await until(async()=>(await snapshot()).connection?.state==='ready','adapter ready');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,960));
}
async function stopOwnedService(){
 await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});});
 await call('stopService',{});await app.close();app=null;page=null;
}
async function taskFiles(root){const found=[];for(const item of await readdir(root,{withFileTypes:true})){if(item.isSymbolicLink())continue;const path=join(root,item.name);if(item.isDirectory())found.push(...await taskFiles(path));else if(item.name==='task-mode.json')found.push(path);}return found;}
const readTask=()=>call('manage',{projectId:pid,operation:'task',taskId});
try{
 await launch();
 await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},workspace);
 await page.evaluate(()=>window.arealDesktop.chooseProject());
 pid=(await until(async()=>(await snapshot()).projects.find(project=>project.root===workspace&&project.state?.connected),'fixture project ready')).id;
 const created=await call('manage',{projectId:pid,operation:'taskCreate',mode:'scheduled',objective:'TASK_HISTORY_ARCHIVE_FIXTURE',schedule:{at:Math.floor(Date.now()/1000)+86400,timeZone:'Asia/Shanghai'}});
 taskId=created.id;
 const execution=await call('create',{projectId:pid});coldThreadId=execution.threadId;
 assert.equal(typeof coldThreadId,'string');
 await stopOwnedService();
 const candidates=await taskFiles(scratch);let path;
 for(const candidate of candidates){const value=JSON.parse(await readFile(candidate,'utf8'));if(value.tasks?.[taskId]){path=candidate;break;}}
 assert.ok(path,'fixture locates its owned legacy task snapshot');
 const fixture=structuredClone(created),start=Math.floor(Date.now()/1000)-20000;
 delete fixture.runCount;delete fixture.archivedRunCount;delete fixture.runsComplete;
 const usage={inputTokens:4,cachedInputTokens:0,outputTokens:3,tokensUsed:7,reservedTokens:0,unknownRequests:0,turnsStarted:1,timeUsedSeconds:1,accountingComplete:true};
 fixture.runs=Array.from({length:160},(_,index)=>({id:`history-run-${String(index).padStart(3,'0')}`,threadId:index===0?coldThreadId:null,goalId:null,status:'completed',reason:null,objective:`Original objective ${index}`,scheduledAt:start+index*60,startedAt:start+index*60,completedAt:start+index*60+1,usage,waitRequested:false,workers:index===0?[{threadId:coldThreadId,turnId:'cold-worker-turn',status:'completed',settled:true}]:[]}));
 fixture.messages=[{id:'cold-report',sequence:1,runId:'history-run-000',author:'system',kind:'report',status:'published',createdAt:start+1,expiresAt:null,questions:[],required:false,inReplyTo:null,answers:null,text:'COLD_RUN_REPORT_SENTINEL'},{id:'cold-worker-report',sequence:2,runId:'history-run-000',author:coldThreadId,kind:'workerReport',status:'published',createdAt:start+2,expiresAt:null,questions:[],required:false,inReplyTo:null,answers:null,text:'COLD_WORKER_REPORT_SENTINEL'}];
 fixture.channelSequence=2;fixture.paused=true;fixture.revision++;const store={version:3,tasks:{[taskId]:fixture},receipts:[],preparations:{}};
 await writeFile(path,JSON.stringify(store));
 checks.push('setup only: isolated stopped legacy v3 snapshot contains 160 terminal runs and exact cold Thread/worker/report identities');
 await launch();
 const capabilities=await call('manage',{projectId:pid,operation:'taskHistoryCapabilities'});assert.equal(capabilities.enabled,true,'integrated Core advertises run history methods');
 const migrated=await readTask();assert.equal(migrated.runCount,160);assert.ok(migrated.runs.length<=128);assert.equal(migrated.runsComplete,false);assert.equal(migrated.archivedRunCount,160-migrated.runs.length);
 const oldest=await call('manage',{projectId:pid,operation:'taskRun',taskId,runId:'history-run-000'});
 assert.equal(oldest.threadId,coldThreadId);assert.equal(oldest.workers[0].turnId,'cold-worker-turn');
 const first=await call('manage',{projectId:pid,operation:'taskRuns',taskId,limit:100});
 assert.equal(first.data.length,100);assert.equal(first.hasMore,true);assert.equal(typeof first.nextCursor,'string');
 const second=await call('manage',{projectId:pid,operation:'taskRuns',taskId,cursor:first.nextCursor,limit:100});
 assert.equal(new Set([...first.data,...second.data].map(run=>run.id)).size,160);assert.equal(second.hasMore,false);
 checks.push('real Core migrates legacy history, bounds the hot window, resolves exact cold run and pages all 160 IDs without duplicates');
 await app.evaluate((_electron,target)=>global.taskHistoryNotificationOpen(target),{projectId:pid,taskId,runId:'history-run-000'});
 const revealed=page.locator('.task-resource-history [data-run-id="history-run-000"]');
 await revealed.waitFor();
 await until(async()=>revealed.evaluate(node=>node.contains(document.activeElement)),'cold notification focuses its exact resolved run');
 await page.getByRole('button',{name:'任务资源',exact:true}).click();
 assert.equal(await page.getByLabel('任务资源面板',{exact:true}).count(),0,'user can close notification reveal without reopening');
 checks.push('synthetic external notification target enters the real Main/preload/App path; exact cold Core lookup opens and focuses its record once; native OS notification delivery is not exercised');
 await app.close();app=null;page=null;
 await launch();
 await page.getByRole('button',{name:'定时任务',exact:true}).click();
 await page.getByRole('button',{name:'打开自动化 TASK_HISTORY_ARCHIVE_FIXTURE',exact:true}).click();
 await page.getByRole('button',{name:'任务资源',exact:true}).click();
 const history=page.locator('.task-resource-history');await history.waitFor();
 if(await history.getAttribute('open')===null)await history.locator('summary').click();
 await history.getByText(/最近窗口.*共 160 次/).waitFor();
 assert.equal(await history.locator('[data-run-id="history-run-000"]').count(),0,'cold run is outside the hot window before paging');
 await history.getByRole('button',{name:'加载更早运行',exact:true}).click();
 const cold=history.locator('[data-run-id="history-run-000"]');await cold.waitFor();
 await cold.getByText('Original objective 0',{exact:false}).waitFor();
 await cold.getByText('COLD_RUN_REPORT_SENTINEL',{exact:true}).first().waitFor();
 await cold.getByText('COLD_WORKER_REPORT_SENTINEL',{exact:true}).waitFor();
 assert.equal(await cold.getByRole('button',{name:'继续本次运行',exact:true}).count(),0);
 assert.equal(await cold.getByRole('button',{name:'停止本次运行',exact:true}).count(),0);
 const runIds=await history.locator('[data-run-id]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-run-id')));assert.equal(runIds.length,160);assert.equal(new Set(runIds).size,160);
 await page.screenshot({path:join(scratch,'cold-run-history.png')});
 await cold.getByRole('button',{name:'打开执行会话',exact:true}).click();
 await until(async()=>await page.getByTestId('areal-workbench').getAttribute('data-thread-id')===coldThreadId&&await page.getByTestId('areal-workbench').getAttribute('data-project-id')===pid,'cold history opens its exact original execution Thread');
 checks.push('real TaskCenter loads older history without duplicate rows, retains cold report and worker identity, offers no terminal-run controls and opens the original execution Thread');
 assert.deepEqual(errors,[]);passed=true;
}catch(error){
 if(page){await writeFile(join(scratch,'failure-state.json'),JSON.stringify(await snapshot(),null,2)).catch(()=>{});await page.screenshot({path:join(scratch,'failure.png')}).catch(()=>{});}
 throw error;
}finally{
 if(app){try{await stopOwnedService();}catch(error){errors.push(`cleanup: ${error.message}`);await app.close().catch(()=>{});}}
 passed=passed&&errors.length===0;if(!passed)process.exitCode=1;
 await writeFile(join(scratch,'evidence.json'),JSON.stringify({passed,binary,binarySha256,checks,errors},null,2));
 console.log(JSON.stringify({passed,scratch,checks,errors}));
}
