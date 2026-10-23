import{chromium}from'playwright';
import{spawn}from'node:child_process';
import{mkdir,writeFile}from'node:fs/promises';
import{resolve,join}from'node:path';

// Replay only the actions needed for current-build captures. The complete
// behavioural suite remains in narrative-qa.mjs and is not repeated here.
const output=resolve(process.argv[2]??'output/qa/final-20261023'),report={screens:[],checks:[],errors:[]};
await mkdir(output,{recursive:true});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','5417','--strictPort'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
let browser;
try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('预览启动超时')),15000);server.once('error',reject);server.stdout.on('data',data=>{if(data.toString().includes('5417')){clearTimeout(timer);resolve();}});});
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--force_high_performance_gpu']});
 const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 page.on('pageerror',error=>report.errors.push(error.message));page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text().slice(0,700));});page.on('response',response=>{if(response.status()>=400)report.errors.push(response.status()+' '+new URL(response.url()).pathname);});
 const state=()=>page.evaluate(()=>window.garden.getNarrativeState());
 const check=(name,pass,detail)=>{report.checks.push({name,pass,detail});if(!pass)throw new Error(name);};
 const frames=async(n=20)=>{const start=await page.evaluate(()=>window.garden.getDiagnostics().frames);await page.waitForFunction(({start,n})=>window.garden.getDiagnostics().frames>start+n,{start,n},{timeout:60000});};
 const settled=async()=>{await page.waitForFunction(()=>!window.garden.getDiagnostics().transitioning&&!window.garden.getNarrativeState().traveling);await frames();};
 const shot=async name=>{await frames();await page.screenshot({path:join(output,name+'.png')});report.screens.push({file:name+'.png',viewport:[1600,900]});console.log('实拍 '+name);};
 const read=async id=>{await page.evaluate(id=>window.garden.goToMemory(id),id);await settled();await page.keyboard.press('e');await page.waitForFunction(()=>document.getElementById('memory-dialog').open);};
 const finish=async(n=3)=>{for(let i=0;i<n;i++)await page.locator('#memory-next').click();await page.waitForFunction(()=>!document.getElementById('memory-dialog').open);await settled();};
 await page.goto('http://127.0.0.1:5417/');await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',null,{timeout:120000});
 report.entry=await page.evaluate(()=>[...document.scripts].find(script=>script.type==='module')?.getAttribute('src'));
 await page.locator('#enter').click();await settled();await page.waitForFunction(()=>Number(getComputedStyle(document.getElementById('poster')).opacity)<.01);await shot('01-入园与沿路引导');
 await read('painting');await shot('02-原文与人物');await finish();await page.locator('[data-subject="path"]').click();await page.locator('#stage-primary').click();await frames();
 check('当前环境实际取景保留画面和位姿',!!(await state()).actions.painting?.view);await shot('03-留下实际园景');await page.locator('#stage-primary').click();
 await page.locator('#journal-toggle').click();await page.locator('[data-journal-tab="painting"]').click();await shot('10-拾忆册与接续');await page.locator('#journal-close').click();
 await read('banquet');await finish();await shot('04-挪近小桌');
 const hint=await page.locator('#table-drag-hint').evaluate(element=>({x:parseFloat(element.style.left),y:parseFloat(element.style.top),sign:element.textContent.includes('←')?-1:1}));
 await page.mouse.move(hint.x,hint.y);await page.mouse.down();await page.mouse.move(hint.x+hint.sign*240,hint.y,{steps:20});await page.mouse.up();
 for(let i=0;i<5&&(await state()).actions.table<1;i++)await page.locator('#stage-primary').click();
 await page.locator('#stage-primary').click();await settled();await shot('05-换到席边');await page.locator('#stage-primary').click();
 await read('tea');await finish();await page.locator('#stage-primary').click();await settled();await shot('06-携杯出门');
 await page.locator('#garden').focus();await page.keyboard.down('w');let outside=false;
 for(let i=0;i<55;i++){await page.waitForTimeout(100);if(await page.locator('#cup-deliver').isVisible()){outside=true;break;}}
 await page.keyboard.up('w');check('环境续改后仍能持杯走过真实门槛',outside);await page.keyboard.press('e');await page.waitForFunction(()=>window.garden.getNarrativeState().actions.cup==='wrapped');await settled();await shot('07-包杯与回望山门');await page.locator('#stage-primary').click();
 await read('ending');await finish(2);await page.evaluate(()=>Promise.all(document.getElementById('snow-veil').getAnimations().map(animation=>animation.finished)));await frames();
 check('地表与冠层续改后仍进入实际冬雪',await page.evaluate(()=>window.garden.getState().season==='winter'&&window.garden.getState().weather==='snow'&&window.garden.getNarrativeState().ended));await shot('08-主动让雪落下');
 await page.locator('#journal-toggle').click();await page.locator('[data-journal-tab="painting"]').click();await page.locator('#journal-items [data-revisit-painting]:visible').click();await settled();await page.waitForSelector('#painting-revisit:not([hidden])');
 const comparison=await page.evaluate(()=>{const state=window.garden.getNarrativeState(),picture=state.actions.painting,position=window.garden.getDiagnostics().cameraPosition;return{snow:window.garden.getState().weather==='snow',ended:state.ended,distance:Math.hypot(position[0]-picture.view.eye[0],-position[2]-picture.view.eye[1],position[1]-picture.view.eye[2]),sameImage:document.getElementById('painting-revisit-image').src===picture.image};});
 check('同一当前构建的雪后原位重看与旧画一致',comparison.snow&&comparison.ended&&comparison.distance<.1&&comparison.sameImage,comparison);await shot('09-雪中返回取景处');
}catch(error){report.failure=error.message;process.exitCode=1;}finally{
 await browser?.close();server.kill();await writeFile(join(output,'capture-report.json'),JSON.stringify(report,null,2)+'\n','utf8');console.log(JSON.stringify(report));if(report.errors.length)process.exitCode=1;
}
