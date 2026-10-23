import {chromium}from'playwright';
import{writeFile,mkdir}from'node:fs/promises';
import{resolve,join}from'node:path';
import{spawn}from'node:child_process';
const production=process.argv.includes('--production');
const outputArgument=process.argv.indexOf('--output-dir');
const outputDir=resolve(outputArgument>=0?process.argv[outputArgument+1]:'output/qa');
await mkdir(outputDir,{recursive:true});
const server=production?spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','5417','--strictPort'],{windowsHide:true,stdio:['ignore','pipe','pipe']}):null;
if(server)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('生产预览启动超时')),15000);server.once('error',reject);server.stdout.on('data',chunk=>{if(chunk.toString().includes('5417')){clearTimeout(timer);resolve();}});});
const origin=production?'http://127.0.0.1:5417/':'http://127.0.0.1:5416/';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--force_high_performance_gpu']});
const page=await browser.newPage({viewport:{width:1366,height:768},deviceScaleFactor:1,reducedMotion:production?'no-preference':'reduce'});
const report={checks:[],errors:[],screens:[],performance:[]};
page.on('pageerror',error=>report.errors.push(error.message));page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+new URL(r.url()).pathname);});
page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text().slice(0,700));});
const check=(name,pass,detail)=>{report.checks.push({name,pass,...(detail?{detail}:{} )});if(!pass)throw new Error(name+' '+JSON.stringify(detail??''));};
const state=()=>page.evaluate(()=>window.garden.getNarrativeState());
const frames=async(n=15)=>{const start=await page.evaluate(()=>window.garden.getDiagnostics().frames);await page.waitForFunction(({start,n})=>window.garden.getDiagnostics().frames>start+n,{start,n},{timeout:60000});};
const shot=async(name)=>{const previous=page.viewportSize();if(name!=='mobile-reading')await page.setViewportSize({width:1600,height:900});await frames();const filename='journey-'+name+'.png';await page.screenshot({path:join(outputDir,filename)});report.screens.push({file:filename,viewport:page.viewportSize()});console.log('截图 '+filename);await page.setViewportSize(previous);await frames();};
const ready=async()=>{await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',null,{timeout:120000});};
async function sample(name){const metrics=await page.evaluate(async()=>{const samples=[];let previous=performance.now(),start=previous;await new Promise(resolve=>{const step=time=>{samples.push(time-previous);previous=time;if(time-start<1800)requestAnimationFrame(step);else resolve();};requestAnimationFrame(step);});samples.sort((a,b)=>a-b);return {fps:+(1000/(samples.reduce((a,b)=>a+b,0)/samples.length)).toFixed(1),p95Ms:+samples[Math.floor(samples.length*.95)].toFixed(1),maxFrameMs:+samples.at(-1).toFixed(1),diagnostics:window.garden.getDiagnostics()};});report.performance.push({name,...metrics});}
const enter=async()=>{await page.locator('#enter').click();await page.waitForFunction(()=>window.garden.getNarrativeState().started&&!window.garden.getDiagnostics().transitioning&&window.garden.getDiagnostics().navigation==='walk');await page.waitForFunction(()=>Number(getComputedStyle(document.getElementById('poster')).opacity)<.01);await frames();};
const go=async(id)=>{await page.evaluate(id=>window.garden.goToMemory(id),id);await frames();};
const read=async(id)=>{await go(id);await page.keyboard.press('e');await page.waitForFunction(()=>document.getElementById('memory-dialog').open);};
const finish=async(n=3)=>{for(let i=0;i<n;i++)await page.locator('#memory-next').click();await page.waitForFunction(()=>!document.getElementById('memory-dialog').open&&!window.garden.getDiagnostics().transitioning);await frames();};
async function fit(name){
 const result=await page.evaluate(()=>{
  const roots=[...document.querySelectorAll('dialog[open],#journey-stage:not([hidden]),#painting-revisit:not([hidden]),#welcome:not([hidden])')];
  const outside=[];for(const root of roots){const r=root.getBoundingClientRect();if(r.top<-.5||r.left<-.5||r.right>innerWidth+.5||r.bottom>innerHeight+.5)outside.push(root.id+' viewport');if(root.scrollHeight>root.clientHeight+2)outside.push(root.id+' content '+root.scrollHeight+'/'+root.clientHeight);for(const element of root.querySelectorAll('button,a,input,select')){if(!element.getClientRects().length)continue;const p=element.getBoundingClientRect();if(p.top<r.top-.5||p.bottom>r.bottom+.5||p.left<r.left-.5||p.right>r.right+.5)outside.push(element.id||element.textContent.slice(0,20));}}
  return {outside,pageFits:document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight};
 });check(name,result.pageFits&&!result.outside.length,result);
}
try{
 await page.goto(origin);await ready();await fit('1366开场一屏');await enter();await shot('entry-garden');
 await page.keyboard.press('e');check('远处E不展开记忆',!await page.locator('#memory-dialog').evaluate(e=>e.open));
 const remote=await page.evaluate(async()=>{try{await window.garden.activateInteraction('memory.tea');return false;}catch{return true;}});check('接口同样拦截远程现场激活',remote);
 await page.waitForFunction(()=>Number(document.getElementById('route-whisper').dataset.routePoints)>1,null,{timeout:30000});
 check('入园有可走的轻量引线',await page.locator('#route-whisper').getAttribute('data-target')==='painting');
 await page.locator('#guide-toggle').click();await page.waitForFunction(()=>document.getElementById('route-whisper').hidden);check('可收起引线，经历不被改变',await page.locator('#route-whisper').isHidden()&&(await state()).completed.length===0);await page.locator('#guide-toggle').click();
 check('入园尚无已完成经历',(await state()).completed.length===0);
 await page.setViewportSize({width:1024,height:640});await read('painting');await fit('1024原文一屏且控件完整');await shot('painting-original');
 await page.locator('[data-reading-tab="reflection"]').click();await fit('1024思考与经历分页完整');
 await finish();await page.waitForSelector('#journey-stage:not([hidden])');await fit('1024取景面板一屏');
 await page.locator('[data-subject="path"]').click();await page.locator('#stage-primary').click();await frames();
 const painting=(await state()).actions.painting;check('真实取景记录主题与本地画面',painting?.subject==='path'&&painting.image.startsWith('data:image/webp;base64,'));
 await shot('painting-kept');await page.locator('#stage-primary').click();
 const before=await page.evaluate(()=>window.garden.getDiagnostics().cameraPosition);
 await page.reload();await ready();check('刷新提供继续入口',(await page.locator('#enter').innerText()).includes('继续'));await shot('resume-entry');await enter();
 const after=await page.evaluate(()=>window.garden.getDiagnostics().cameraPosition);
 check('刷新保留画笺与实际位置',(await state()).completed.includes('painting')&&Math.hypot(...before.map((n,i)=>n-after[i]))<.1);
 await page.setViewportSize({width:1920,height:1080});await page.locator('#journal-toggle').click();await fit('1920拾忆册一屏');await shot('journal-kept');await page.locator('#journal-close').click();
 await page.setViewportSize({width:1366,height:768});await read('banquet');await fit('1366原文一屏');await finish();await shot('table-before');await sample('席面拖动场景');
 check('动作场面聚焦且始终可暂回园中',await page.locator('#home').isDisabled()&&await page.locator('#stage-close').isVisible());
 const hint=await page.locator('#table-drag-hint').evaluate(e=>({x:parseFloat(e.style.left),y:parseFloat(e.style.top),sign:e.textContent.includes('←')?-1:1}));
 await page.mouse.move(hint.x,hint.y);await page.mouse.down();await page.mouse.move(hint.x+hint.sign*240,hint.y,{steps:20});await page.mouse.up();
 check('直接拖动实际三维小桌改变距离',(await state()).actions.table>.02,{progress:(await state()).actions.table,hint});
 for(let i=0;i<4&&(await state()).actions.table<1;i++)await page.locator('#stage-primary').click();
 check('只挪近小桌尚未完成换位',(await state()).actions.beside===false);
 await page.locator('#stage-primary').click();await page.waitForFunction(()=>window.garden.getNarrativeState().actions.beside&&!window.garden.getDiagnostics().transitioning);await frames();check('换到她一边后才留下席间经历',(await state()).completed.includes('banquet'));await shot('table-beside');
 await page.setViewportSize({width:1024,height:640});await fit('1024席边行动一屏');await page.locator('#stage-primary').click();
 await read('tea');await fit('1024茶事原文一屏');await finish();await page.locator('#stage-primary').click();await frames();
 check('接杯后仍需实际走过门槛',(await state()).actions.cup==='carrying'&&!(await state()).completed.includes('tea'));await shot('cup-carrying');await sample('三维持杯场景');
 const heldAt=await page.evaluate(()=>window.garden.getDiagnostics().cameraPosition);await page.reload();await ready();await enter();
 const heldRestored=await page.evaluate(()=>window.garden.getDiagnostics().cameraPosition);check('持杯时刷新接续，不丢物件或位置',(await state()).actions.cup==='carrying'&&Math.hypot(...heldAt.map((n,i)=>n-heldRestored[i]))<.1);await shot('carrying-resumed');
 await page.locator('#garden').focus();await page.keyboard.down('w');
 let delivered=false;for(let i=0;i<45;i++){await page.waitForTimeout(100);if(await page.locator('#cup-deliver').isVisible()){delivered=true;break;}}
 await page.keyboard.up('w');await frames();check('WASD携杯实际穿过山门并触达包袱',delivered,{position:await page.evaluate(()=>window.garden.getDiagnostics().cameraPosition)});await shot('cup-doorstep');
 await page.keyboard.press('e');await page.waitForFunction(()=>window.garden.getNarrativeState().actions.cup==='wrapped'&&!window.garden.getDiagnostics().transitioning);await frames();check('门外包杯后完整旅程才可回望',(await state()).actions.cup==='wrapped'&&(await state()).canEnd);await shot('cup-wrapped');await page.locator('#stage-primary').click();
 await page.setViewportSize({width:1366,height:768});await read('ending');await fit('1366回望一屏');
 check('终章回收真实画笺与三项实际经历',await page.locator('#memory-recap img').count()===1&&await page.locator('#memory-recap p').count()===3);
 await page.setViewportSize({width:1024,height:640});await page.locator('[data-reading-tab="reflection"]').click();for(const id of ['painting','banquet','tea']){await page.locator('[data-experience="'+id+'"]').click();await fit('1024回望分页-'+id);}
 check('主动落雪前不替玩家作决定',!(await state()).ended);await finish(2);await page.evaluate(()=>Promise.all(document.getElementById('snow-veil').getAnimations().map(a=>a.finished)));check('主动落雪进入冬景',(await state()).ended&&await page.evaluate(()=>window.garden.getState().season==='winter'&&window.garden.getState().weather==='snow'));await shot('snow-recap');await sample('雪后回望场景');
 await page.reload();await ready();await enter();check('刷新接续雪后状态',(await state()).ended&&await page.evaluate(()=>window.garden.getState().weather==='snow'));
 await read('tea');await page.locator('[data-reading-tab="reflection"]').click();check('雪后原地可回收杯盏经历',(await page.locator('#memory-experience').innerText()).includes('门槛')&&(await page.locator('#memory-experience').innerText()).includes('度日'));await shot('snow-cup-return');
 await page.locator('#memory-close').click();await page.locator('#journal-toggle').click();await page.locator('[data-journal-tab="painting"]').click();await page.locator('#journal-items [data-revisit-painting]:visible').click();
 await page.waitForFunction(()=>!window.garden.getNarrativeState().traveling&&!document.getElementById('painting-revisit').hidden);await frames();
 const comparison=await page.evaluate(()=>{const s=window.garden.getNarrativeState(),p=s.actions.painting,eye=window.garden.getDiagnostics().cameraPosition;return {ended:s.ended,snow:window.garden.getState().weather==='snow',distance:Math.hypot(eye[0]-p.view.eye[0],-eye[2]-p.view.eye[1],eye[1]-p.view.eye[2]),sameImage:document.getElementById('painting-revisit-image').src===p.image};});
 check('雪后重返自己取景的位置，旧画与真实雪景并看',comparison.ended&&comparison.snow&&comparison.distance<.1&&comparison.sameImage,comparison);await fit('1024旧画与眼前对照完整');await shot('painting-revisited');
 await page.locator('#painting-revisit-close').click();await read('tea');
 await page.setViewportSize({width:390,height:844});await fit('390窄屏回读与必要控件完整');await shot('mobile-reading');
 await page.locator('#memory-close').click();await page.locator('#journal-toggle').click();await page.locator('#restart-garden').click();await frames();check('仅明确重游清空记录并恢复秋日',!(await state()).ended&&(await state()).completed.length===0&&await page.evaluate(()=>window.garden.getState().season==='autumn'));
}catch(error){report.failure=error.message;await page.screenshot({path:join(outputDir,'journey-failure.png')}).catch(()=>{});const s=await state().catch(()=>null);report.lastState=s?{seen:s.seen,completed:s.completed,current:s.current,page:s.page,ended:s.ended,cup:s.actions.cup,table:s.actions.table,beside:s.actions.beside,painting:s.actions.painting?{subject:s.actions.painting.subject,imageBytes:s.actions.painting.image.length}:null}:null;}finally{
 await browser.close();server?.kill();await writeFile(join(outputDir,production?'journey-production.json':'journey-flow.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({checks:report.checks,errors:report.errors,failure:report.failure}));if(report.failure||report.errors.length)process.exitCode=1;
}
