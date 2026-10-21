import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const gui = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(gui, 'app/package.json'));
const { chromium } = require('playwright-core');
const dist = process.env.AREAL_RENDERER_DIST || join(gui, 'renderer/dist');
const scratch = await mkdtemp('/private/tmp/areal-restoration-ui-');
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname);
    const path = resolve(dist, pathname === '/' ? 'index.html' : `.${pathname}`);
    if (!path.startsWith(dist + sep)) throw new Error('Invalid asset path');
    response.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }[extname(path)] || 'application/octet-stream');
    response.end(await readFile(path));
  } catch {
    response.statusCode = 404;
    response.end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser, passed = false;
const checks = [], errors = [];
try {
  browser = await chromium.launch({ headless: true, ...(process.env.AREAL_GUI_TEST_BROWSER ? { executablePath: process.env.AREAL_GUI_TEST_BROWSER } : { channel: 'chrome' }) });
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 }, serviceWorkers: 'block' });
  page.on('pageerror', error => errors.push(error.message));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.addInitScript(() => {
    const threadId='synthetic-history';
    const project={id:'restore-fixture',root:'/isolated/workspace',state:{connected:false,threads:{},queues:{},interactions:{}},error:null,
      models:[],profiles:[],pending:[],summaries:[{id:threadId,name:'Synthetic history restoration',preview:'Synthetic history restoration',status:'idle'}],configurations:{},outcomes:{},core:{}};
    const snapshot={revision:1,projects:[project],connection:{state:'ready'},library:{projects:{},threads:{},settings:{},projectOrder:[]}};
    let listener, projectionListener, sequence=0; let fail=true;
    window.calls=[];
    localStorage.setItem('areal-gui:project',project.id);
    localStorage.setItem(`areal-gui:thread:${project.id}`,threadId);
    window.recoverProject=()=>{fail=false;project.state.connected=true;project.error=null;snapshot.revision++;listener(structuredClone(snapshot));};
    window.disconnectDesktop=()=>{delete project.state.threads[threadId];project.state.connected=false;snapshot.connection.state='unavailable';snapshot.revision++;listener(structuredClone(snapshot));};
    window.recoverDesktop=()=>{project.state.connected=true;snapshot.connection.state='ready';snapshot.revision++;listener(structuredClone(snapshot));};
    window.fixture=()=>structuredClone(snapshot);
    window.arealDesktop={
      snapshot:async()=>structuredClone(snapshot),onProjection:callback=>{projectionListener=callback;listener=value=>callback({frame:{projection:1,stream:'diagnosis-fixture',sequence:++sequence,kind:'full',snapshot:value}});return()=>{};},requestProjection:requestId=>projectionListener({requestId,frame:{projection:1,stream:'diagnosis-fixture',sequence:++sequence,kind:'full',snapshot:structuredClone(snapshot)}}),
      theme:async()=>({platform:'darwin',dark:false,id:'light'}),onTheme:()=>()=>{},onMcpAppEvent:()=>()=>{},presentReady:async()=>{},preview:async()=>({}),
      command:async(name,params)=>{
        window.calls.push({name,params});
        if(name==='connect'&&fail)return {ok:false,error:{code:'RESPONSE_UNKNOWN',message:'Core disconnected; request outcome may be unknown',submissionUnknown:true}};
        if(name==='workspace')return {ok:true,value:{git:true,branch:'main'}};
        if(name==='trajectory')return {ok:true,value:{enabled:false,state:'disabled',queue:{},records:[]}};
        if(name==='open') {
          project.state.threads[params.threadId]={id:params.threadId,cwd:project.root,status:'idle',turns:[{id:'restored-turn',status:'completed',items:[{id:'restored-reply',type:'agentMessage',phase:'final_answer',text:'RESTORED_HISTORY_SENTINEL'}]}]};
          snapshot.revision++;listener(structuredClone(snapshot));
        }
        return {ok:true,value:{data:[]}};
      },
    };
  });  await page.goto(origin);
  const failure=page.getByText('暂时无法加载对话，请重试或切换对话。',{exact:true});
  const banner=page.locator('.error-banner');
  await failure.waitFor();
  await banner.filter({hasText:'Core disconnected; request outcome may be unknown'}).waitFor();
  await page.screenshot({path:join(scratch,'01-initial-failure.png'),animations:'disabled'});
  await page.evaluate(()=>window.recoverProject());
  await page.getByText('RESTORED_HISTORY_SENTINEL',{exact:true}).waitFor({timeout:5000});
  assert.equal(await failure.count(),0,'the restored transcript replaces the failure screen');
  assert.equal(await banner.count(),0,'successful restoration clears its own disconnect error');
  const calls=await page.evaluate(()=>window.calls);
  assert.equal(calls.filter(call=>call.name==='open'&&call.params.threadId==='synthetic-history').length,1,'one selected history observation is sufficient');
  assert.deepEqual(calls.filter(call=>['send','create','steer','enqueue'].includes(call.name)),[],'recovery must never replay a submission');
  await page.screenshot({path:join(scratch,'02-project-recovered-history.png'),animations:'disabled'});
  checks.push('Project-only Core recovery restores the selected transcript and clears the matching error.');
  checks.push('Restoration observes history once and never replays a submission.');
  await page.evaluate(()=>window.disconnectDesktop());
  await page.getByText('RESTORED_HISTORY_SENTINEL',{exact:true}).waitFor({state:'hidden'});
  await page.evaluate(()=>window.recoverDesktop());
  await page.getByText('RESTORED_HISTORY_SENTINEL',{exact:true}).waitFor({timeout:5000});
  assert.equal((await page.evaluate(()=>window.calls)).filter(call=>call.name==='open').length,2,'outer service recovery re-observes without a Core generation change');
  assert.equal(await banner.count(),0);
  checks.push('Desktop reconnect restores the selected history even when the Core connection generation is unchanged.');
  await page.screenshot({path:join(scratch,'03-desktop-recovered-history.png'),animations:'disabled'});
  assert.deepEqual(errors,[]);passed=true;
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await writeFile(join(scratch, 'manifest.json'), JSON.stringify({ passed, checks, errors, scope: 'built renderer in Chrome with controlled Desktop contract snapshots' }, null, 2));
  console.log(JSON.stringify({ passed, evidence: scratch, checks, errors }));
}
