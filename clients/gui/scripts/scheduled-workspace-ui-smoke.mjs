import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from '../renderer/node_modules/vite/dist/node/index.js';
const gui = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(gui, 'app/package.json'));
const { chromium } = require('playwright-core');
const evidence = await mkdtemp('/tmp/areal-scheduled-ui-');
const entry = String.raw`
import React from 'react';import {createRoot} from 'react-dom/client';
import {TaskCenter} from '/src/TaskCenter.tsx';import {ApplicationIntlProvider} from '/src/i18n/IntlProvider.tsx';import '/src/styles.css';
const project={id:'00000000-0000-4000-a000-000000000001',name:'Fixture project',root:'/fixture',state:{connected:true,threads:{}},core:{connectionGeneration:1},pending:[],outcomes:{}};
window.calls=[];window.fail=new URLSearchParams(location.search).has('fail');
const rows=new URLSearchParams(location.search).has('empty')?[]:[['active','每日进展',false],['paused','每周回顾',true]].map(([id,objective,paused])=>({projectId:project.id,id,objective,paused,mode:'scheduled',sourceThreadId:id+'-thread',runs:[],nextRunAt:2000000000,schedule:{kind:'once',at:2000000000},scope:'workspace'}));
const action=async(name,params)=>{window.calls.push({name,params});if(name==='tasks'){if(window.fail)throw Error('Fixture catalog unavailable');return {projectId:project.id,requestId:params.requestId,viewEpoch:params.viewEpoch,data:rows,hasMore:false,errors:[],owners:[{connectionGeneration:1}]};}if(name==='open'){project.state.threads[params.threadId]={id:params.threadId};return {};}return {data:[],enabled:false,runNow:false};};
createRoot(document.getElementById('root')).render(<ApplicationIntlProvider><div style={{height:'100vh',display:'flex'}}><TaskCenter projects={[project]} connected action={action} onOpenThread={()=>{}} onOpenModelSettings={()=>{}} navigation={null} renderConversation={()=> <p>会话详情</p>} renderResources={()=>null}/></div></ApplicationIntlProvider>);
`;
const virtual='\0scheduled-fixture';
const vite=await createServer({root:join(gui,'renderer'),configFile:join(gui,'renderer/vite.config.ts'),mode:'design-system',server:{host:'127.0.0.1',port:0},plugins:[{name:'scheduled-fixture',resolveId:id=>id==='/scheduled-fixture.tsx'?virtual:undefined,load:async id=>id===virtual?transformWithEsbuild(entry,'scheduled-fixture.tsx',{loader:'tsx',jsx:'automatic'}):undefined,configureServer(server){server.middlewares.use(async(req,res,next)=>{if(!req.url.startsWith('/__scheduled.html'))return next();res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/__scheduled.html','<html><body style="margin:0"><div id="root"></div><script type="module" src="/scheduled-fixture.tsx"></script></body></html>'));});}}]});
let browser,page,passed=false;const errors=[];
try {
 await vite.listen();browser=await chromium.launch({executablePath:process.env.AREAL_CHROMIUM_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});page=await browser.newPage({viewport:{width:1100,height:800}});page.on('pageerror',e=>errors.push(e.message));const url=`http://127.0.0.1:${vite.httpServer.address().port}/__scheduled.html`;
 await page.goto(url);await page.getByRole('button',{name:'打开自动化 每日进展',exact:true}).waitFor();
 assert.equal(await page.getByRole('combobox',{name:'筛选项目'}).count(),0);assert.equal(await page.getByText('项目加载状态',{exact:true}).count(),0);
 await page.getByRole('group',{name:'已开启',exact:true}).getByRole('button',{name:'打开自动化 每日进展'}).waitFor();
 await page.getByRole('group',{name:'已暂停',exact:true}).getByRole('button',{name:'打开自动化 每周回顾'}).waitFor();
 assert.equal(await page.locator('.scheduled-workspace').evaluate(el=>getComputedStyle(el).display),'flex');
 assert.ok(!(await page.locator('body').innerText()).includes('00000000-0000-4000-a000-000000000001'));
 await page.screenshot({path:join(evidence,'01-groups.png')});
 await page.getByRole('button',{name:'搜索定时任务',exact:true}).click();await page.getByRole('textbox',{name:'搜索定时任务',exact:true}).fill('每周');assert.equal(await page.getByRole('button',{name:'打开自动化 每日进展'}).count(),0);await page.getByRole('button',{name:'打开自动化 每周回顾'}).click();await page.getByRole('heading',{name:'每周回顾',exact:true}).waitFor();
 await page.setViewportSize({width:480,height:800});await page.getByTestId('task-center-list').waitFor({state:'hidden'});await page.getByRole('button',{name:'关闭任务详情',exact:true}).click();await page.getByTestId('task-center-list').waitFor();
 await page.goto(url+'?empty');await page.getByText('尚无定时任务',{exact:true}).waitFor();await page.screenshot({path:join(evidence,'02-narrow-empty.png')});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.goto(url+'?fail');await page.getByRole('button',{name:'重新加载任务',exact:true}).waitFor();assert.equal(await page.getByText('尚无定时任务',{exact:true}).count(),0);await page.evaluate(()=>window.fail=false);await page.getByRole('button',{name:'重新加载任务',exact:true}).click();await page.getByRole('button',{name:'打开自动化 每日进展'}).waitFor();
 assert.equal(errors.length,0);passed=true;
} finally {await writeFile(join(evidence,'result.json'),JSON.stringify({passed,errors,body:await page?.locator('body').innerText().catch(()=>''),calls:await page?.evaluate(()=>window.calls).catch(()=>[])},null,2));await browser?.close();await vite.close();console.log(JSON.stringify({passed,evidence}));}
