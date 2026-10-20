import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// 真实 Renderer 与适配器；显式 WS 协议替身只验证资源准入，不代表 ARCA 验收。
const gui = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(gui, 'app/package.json'));
const {chromium} = require('playwright-core');
const {WebSocketServer} = require('ws');
const {CloudSettings} = require('../app/src/core/cloud-settings.cjs');
const {CloudConversations} = require('../app/src/core/cloud-conversations.cjs');
const scratch = await mkdtemp('/private/tmp/cloud-lifecycle-');
const projectId = 'cloud-fixture-project';
const errors = [], calls = [], workspaces = new Map();
let allocations = 0, queries = 0, page, browser, publishing = Promise.resolve();
const native = createServer((_request, response) => {response.writeHead(404);response.end();});
const sockets = new WebSocketServer({server:native});
sockets.on('connection', (socket, request) => {
  assert.equal(request.headers.authorization, 'Bearer fixture-token');
  const workspace = request.url.split('/').filter(Boolean).at(-1);
  if (!workspaces.has(workspace)) workspaces.set(workspace, {thread:null, alive:false});
  const state = workspaces.get(workspace);
  if (!state.alive) {state.alive = true;allocations++;}
  socket.on('message', raw => {
    const {id, method, params} = JSON.parse(raw);
    if (!id) return;
    calls.push({workspace, method});
    const reply = result => socket.send(JSON.stringify({id,result}));
    if (method === 'initialize') return reply({});
    if (method === 'areal/capabilities') return reply({apiVersion:'areal.core.v1',methods:['areal/thread/start','areal/thread/observe']});
    if (method === 'areal/profile/list') return reply({data:[]});
    if (method === 'areal/thread/start') {
      state.thread ??= {id:`thread-${workspace}`,turns:[],status:{type:'idle'}};
      return reply({thread:state.thread});
    }
    if (method === 'areal/thread/observe') return reply({thread:state.thread});
    assert.equal(method,'turn/start');
    assert.equal(params.threadId,state.thread.id);
    queries++;
    const turn = {id:`turn-${queries}`,status:'completed',items:[{id:`answer-${queries}`,type:'agentMessage',text:`QUERY_OK_${queries}`}],error:null};
    state.thread.turns.push(turn);
    reply({turn});
    socket.send(JSON.stringify({method:'turn/completed',params:{threadId:state.thread.id,turn}}));
  });
});
native.listen(0,'127.0.0.1');await once(native,'listening');
const backend = {
  home:scratch, saved:[{id:projectId,root:'/fixture-project'}],textInput:text=>[{type:'text',text}],
  save:(name,value)=>writeFile(join(scratch,name),JSON.stringify(value)),
  onChange(){ if(page&&!page.isClosed()) publishing=publishing.then(()=>page.evaluate(state=>window.cloudState?.(state),backend.snapshot())).catch(error=>errors.push(error.message)); },
};
backend.cloud = new CloudSettings(backend,{isEncryptionAvailable:()=>true,encryptString:value=>Buffer.from(value),decryptString:value=>value.toString()});
const manager = new CloudConversations(backend);
backend.snapshot=()=>{
  const cloud=manager.projection(projectId);
  return {connection:{state:'ready'},library:{projects:{},threads:{},projectOrder:[],settings:{}},projects:[{
    id:projectId,root:'/fixture-project',backend:'areal',pending:[],outcomes:{},models:[],profiles:[],configurations:{},summariesLoaded:true,summaries:cloud.summaries,core:{features:{}},desktopCapabilities:{currentCommands:true},state:{connected:true,threads:cloud.threads,interactions:{},queues:{}},
  }]};
};
const dist=join(gui,'renderer/dist');
const assets=createServer(async(request,response)=>{
  try {
    const pathname=new URL(request.url,'http://local').pathname;
    const file=resolve(dist,pathname==='/'?'index.html':`.${decodeURIComponent(pathname)}`);
    assert.ok(file.startsWith(dist+sep));
    response.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[extname(file)]??'application/octet-stream');
    response.end(await readFile(file));
  }catch{response.writeHead(404);response.end();}
});
assets.listen(0,'127.0.0.1');await once(assets,'listening');
try {
  browser=await chromium.launch({headless:true,channel:'chrome'});
  page=await browser.newPage({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  page.on('pageerror',error=>errors.push(error.message));
  await page.exposeFunction('cloudSnapshot',()=>backend.snapshot());
  await page.exposeFunction('cloudCommand',async(name,params)=>{
    try {
      let value;
      if(name==='cloud') value=await backend.cloud.command(params);
      else if(name==='cloudSession') value=await manager.command(params);
      else if(name==='open') value=await manager.command({...params,operation:'open'});
      else value={data:[],projects:[],pendingApply:false};
      return {ok:true,value};
    }catch(error){return {ok:false,error:{message:error.message}};}
  });
  await page.addInitScript(({projectId})=>{
    localStorage.setItem('areal-gui:project',projectId);
    localStorage.setItem(`areal-draft-environment:${projectId}`,'cloud');
    window.arealDesktop={snapshot:()=>window.cloudSnapshot(),command:(name,params)=>window.cloudCommand(name,params),onState:listener=>{window.cloudState=listener;return()=>{};},theme:async()=>({platform:'darwin',dark:false,id:'light'}),onTheme:()=>()=>{},onMcpAppEvent:()=>()=>{},presentReady:async()=>{},preview:async()=>({})};
  },{projectId});
  await page.goto(`http://127.0.0.1:${assets.address().port}`);
  await page.getByRole('button',{name:'设置',exact:true}).click();
  await page.getByRole('button',{name:'Cloud',exact:true}).click();
  await page.getByRole('textbox',{name:'Cloud 后端地址'}).fill(`http://127.0.0.1:${native.address().port}/openapi/v1/app-server/`);
  await page.getByRole('textbox',{name:'Cloud token',exact:true}).fill('fixture-token');
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await page.getByRole('status').filter({hasText:'配置已保存'}).waitFor();
  assert.equal(allocations,0);assert.equal(calls.length,0);
  await page.screenshot({path:join(scratch,'saved-without-connection.png')});
  await page.getByRole('button',{name:'返回应用',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Cloud 已连接'}).waitFor();
  assert.equal(allocations,1);
  const first=manager.records[0];assert.equal(first.binding.workspace,first.id);
  await page.getByTestId('cloud-chat-input').fill('first query');
  await page.getByTestId('cloud-chat-send').click();
  await page.getByText('QUERY_OK_1',{exact:true}).waitFor();
  assert.equal(allocations,1);
  await page.screenshot({path:join(scratch,'connected-session.png')});
  // 显式模拟回收：保留权威 thread（UPFS），关闭执行实例与连接。
  workspaces.get(first.id).alive=false;
  for(const socket of sockets.clients) socket.close();
  await page.getByRole('status').filter({hasText:'发送消息时恢复'}).waitFor();
  await page.getByTestId('cloud-chat-input').fill('second query');
  await page.getByTestId('cloud-chat-send').click();
  await page.getByText('QUERY_OK_2',{exact:true}).waitFor();
  assert.equal(allocations,2);assert.equal(queries,2);assert.equal(manager.records.length,1);
  assert.equal(calls.filter(v=>v.method==='areal/thread/start').length,1);
  await page.getByRole('button',{name:'新聊天',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Cloud 已连接'}).waitFor();
  assert.equal(allocations,3);assert.equal(manager.records.length,2);
  assert.notEqual(manager.records[0].binding.workspace,manager.records[1].binding.workspace);
  assert.equal(queries,2);assert.deepEqual(errors,[]);
  await writeFile(join(scratch,'evidence.json'),JSON.stringify({fixture:true,allocations,queries,workspaces:[...workspaces.keys()],calls},null,2));
  console.log(`PASS Cloud lifecycle GUI fixture: ${scratch}`);
}finally{
  manager.close();await browser?.close();
  for(const socket of sockets.clients)socket.terminate();sockets.close();native.closeAllConnections();native.close();assets.closeAllConnections();assets.close();
}
