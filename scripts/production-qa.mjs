import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';

const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','5417','--strictPort'],{cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe']});
const report={url:'http://127.0.0.1:5417/',errors:[],passed:false};
let browser;
try{
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('生产预览服务启动超时')),15000);
    server.once('error',error=>{clearTimeout(timer);reject(error);});
    server.once('exit',code=>{clearTimeout(timer);reject(new Error('生产预览服务退出 '+code));});
    server.stdout.on('data',data=>{if(data.toString().includes('5417')){clearTimeout(timer);resolve();}});
    server.stderr.on('data',data=>{if(data.toString().includes('already in use')){clearTimeout(timer);reject(new Error('5417 端口被占用'));}});
  });
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',error=>report.errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400)report.errors.push(response.status()+' '+response.url());});
  page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text().slice(0,400));});
  await page.goto(report.url);
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',null,{timeout:120000});
  await page.locator('#enter').click();
  await page.evaluate(async()=>{await window.garden.focus('qiushuang','interior');window.garden.setWeather('rain');window.garden.setTime(16);});
  const frames=await page.evaluate(()=>window.garden.getDiagnostics().frames);
  await page.waitForFunction(before=>window.garden.getDiagnostics().frames>before+25,frames);
  report.diagnostics=await page.evaluate(()=>window.garden.getDiagnostics());
  await page.screenshot({path:path.join(process.cwd(),'output/qa/production-interior.png')});
  await page.evaluate(async()=>{window.garden.setWeather('clear');await window.garden.focus('ouxiang','courtyard');window.garden.setNavigationMode('walk');});
  await page.locator('#garden').focus();
  const start=await page.evaluate(()=>window.garden.getDiagnostics().cameraPosition);
  await page.keyboard.down('w');
  try{await page.waitForFunction(start=>{const p=window.garden.getDiagnostics().cameraPosition;return Math.hypot(p[0]-start[0],p[2]-start[2])>11.5;},start,{timeout:15000});}
  finally{await page.keyboard.up('w');}
  const end=await page.evaluate(()=>window.garden.getDiagnostics().cameraPosition);
  report.bridgeWalkPassed=end[1]>2;
  await page.screenshot({path:path.join(process.cwd(),'output/qa/production-bridge.png')});
  await page.keyboard.press('Escape');
  report.passed=report.errors.length===0&&report.diagnostics.loadedLandmarks===22&&report.diagnostics.ready&&report.bridgeWalkPassed;
}catch(error){report.errors.push(String(error));}
finally{await browser?.close();server.kill();}
await writeFile('output/qa/production.json',JSON.stringify(report,null,2),'utf8');
console.log(JSON.stringify(report));
if(!report.passed)process.exitCode=1;
