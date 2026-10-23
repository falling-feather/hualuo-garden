import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
const before=process.argv.includes('--before'),root=process.cwd();
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1,reducedMotion:'reduce'});
const report={phase:before?'before':'after',checks:[],errors:[],screens:[]};
page.on('pageerror',error=>report.errors.push(error.message));
page.on('response',response=>{if(response.status()>=400)report.errors.push(response.status()+' '+new URL(response.url()).pathname);});
const frames=async(n=30)=>{const frame=await page.evaluate(n=>window.garden.getDiagnostics().frames+n,n);await page.waitForFunction(n=>window.garden.getDiagnostics().frames>=n,frame,{timeout:60000});};
const screen=async(name)=>{const file='ecology-'+report.phase+'-'+name+'.png';await page.screenshot({path:path.join(root,'output/qa',file)});report.screens.push(file);};
const check=(name,pass)=>{report.checks.push({name,pass});if(!pass)throw new Error(name+'未通过');};
const goto=async(id)=>{await page.evaluate(id=>window.garden.goToMemory(id),id);await frames(20);};
const read=async()=>{await page.keyboard.press('e');await page.waitForFunction(()=>document.getElementById('memory-dialog').open);for(let i=0;i<3;i++)await page.locator('#memory-next').click();await frames(12);};
try{
  await page.goto('http://127.0.0.1:5416/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',null,{timeout:120000});
  await page.locator('#enter').click();await page.waitForFunction(()=>window.garden.getDiagnostics().navigation==='walk');
  if(!before){
   check('开场介绍省亲营园与人物日常',(await page.locator('.welcome-copy').textContent()).includes('省亲')&&(await page.locator('.welcome-copy').textContent()).includes('姐妹'));
   await page.waitForFunction(()=>Number(document.getElementById('route-whisper').dataset.routePoints)>1,null,{timeout:30000});
   check('入园默认轻量引线到沁芳亭',await page.locator('#route-whisper').getAttribute('data-target')==='painting');
   check('园门的地点语境可见',await page.locator('#place-context').isVisible());
   await screen('arrival');
   await page.locator('#guide-toggle').click();await page.waitForFunction(()=>document.getElementById('route-whisper').hidden);
   check('收起引线不改变阅读进度',await page.evaluate(()=>window.garden.getNarrativeState().seen.length===0));
   await page.locator('#guide-toggle').click();await page.waitForFunction(()=>!document.getElementById('route-whisper').hidden);
   const start=await page.evaluate(()=>window.garden.getDiagnostics().cameraPosition);
   await page.keyboard.down('w');await frames(20);await page.keyboard.up('w');
   check('引导中仍可自主WASD',await page.evaluate(p=>{const q=window.garden.getDiagnostics().cameraPosition;return Math.hypot(p[0]-q[0],p[2]-q[2])>.2;},start));
   await page.locator('#map-toggle').click();await frames(6);
   check('园图显示所在位置与游线',await page.locator('#map-current').getAttribute('visibility')==='visible'&&!!await page.locator('#map-guide').getAttribute('points'));
   await page.locator('[data-close="map"]').click();
   await goto('banquet');check('沿途介绍人物与地点',(await page.locator('#place-context').textContent()).includes('探春'));
   await goto('painting');await read();
   check('原文读毕仍需实际行动',await page.evaluate(()=>window.garden.getNarrativeState().completed.length===0));
   await page.locator('#stage-primary').click();await frames(12);await page.locator('#stage-primary').click();await page.waitForFunction(()=>document.getElementById('route-whisper').dataset.target==='banquet');
   check('行动完成后引线推进',true);
   await goto('tea');await read();check('允许跳过引线建议的顺序',await page.evaluate(()=>window.garden.getNarrativeState().seen.join(',')==='painting,tea'));
   await page.locator('#stage-primary').click();await page.waitForFunction(()=>window.garden.getNarrativeState().actions.cup==='carrying');await page.waitForFunction(()=>document.getElementById('route-whisper').dataset.target==='tea');
   check('携杯时引线优先引向门外',true);await page.locator('#stage-secondary').click();await frames(12);
   check('收起行动面板仍保留手中物件',await page.evaluate(()=>window.garden.getNarrativeState().actions.cup==='carrying'));
   await page.locator('#journal-toggle').click();await page.locator('#restart-garden').click();await frames(20);
   check('明确重游恢复引导',await page.locator('#route-whisper').getAttribute('data-target')==='painting');
  }
  await page.evaluate(()=>{window.garden.setSeason('autumn');window.garden.setWeather('clear');window.garden.setTime(9.5);return window.garden.overview();});await frames();await screen('overview');
  if(!before)check('环览收起上一地点的语境',await page.locator('#place-context').isHidden());
  await page.evaluate(()=>window.garden.focus('qinfang','courtyard'));await frames();await screen('ground');
  if(!before){
   await page.evaluate(()=>window.garden.setNavigationMode('walk'));await frames(20);
   report.planningMs=await page.locator('#route-whisper').getAttribute('data-max-planning-ms');
   report.diagnostics=await page.evaluate(()=>window.garden.getDiagnostics());
   await page.setViewportSize({width:390,height:844});await frames(15);await screen('mobile');
   check('窄屏引导与方向键可操作',await page.locator('#guide-toggle').isVisible()&&await page.locator('[data-move="forward"]').isVisible());
   check('窄屏无横向溢出',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
}catch(error){report.failure=error.stack;}finally{
  await browser.close();await writeFile(path.join(root,'output/qa',before?'ecology-before.json':'journey-guidance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({phase:report.phase,checks:report.checks,errors:report.errors,failure:report.failure}));
  if(report.failure||report.errors.length)process.exitCode=1;
}
