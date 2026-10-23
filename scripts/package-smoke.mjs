import path from'node:path';
import{readFile,writeFile}from'node:fs/promises';
import{chromium}from'playwright';
import{createPreviewServer}from'./local-preview.mjs';
const root=path.resolve(process.argv[2]??'tmp/judging-package'),server=createPreviewServer(path.join(root,'web'));
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(5426,'127.0.0.1',resolve);});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--force_high_performance_gpu']});
const page=await browser.newPage({viewport:{width:1366,height:768},deviceScaleFactor:1,reducedMotion:'reduce'}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+new URL(r.url()).pathname);});
function check(name,pass){checks.push({name,pass});if(!pass)throw new Error(name);}
try{
 await page.goto('http://127.0.0.1:5426/');await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',null,{timeout:120000});
 check('便携包独立载入22处基础场景',await page.evaluate(()=>window.garden.getDiagnostics().loadedLandmarks===22));
 await page.locator('#enter').click();await page.waitForFunction(()=>window.garden.getDiagnostics().navigation==='walk');
 await page.evaluate(()=>window.garden.goToMemory('painting'));await page.waitForFunction(()=>!window.garden.getDiagnostics().transitioning);
 await page.keyboard.press('e');await page.waitForFunction(()=>document.getElementById('memory-dialog').open);
 await page.waitForFunction(()=>document.getElementById('memory-image').complete&&document.getElementById('memory-image').naturalWidth>0);
 check('模型解码与本地图像可用',true);
 for(let i=0;i<3;i++)await page.locator('#memory-next').click();await page.waitForFunction(()=>!window.garden.getDiagnostics().transitioning);
 await page.locator('#stage-primary').click();await page.waitForFunction(()=>window.garden.getNarrativeState().completed.includes('painting'));
 check('便携服务器下可实际取景',await page.evaluate(()=>window.garden.getNarrativeState().actions.painting.image.startsWith('data:image/webp;base64,')));
 await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',null,{timeout:120000});check('便携包同源刷新提供继续游园',(await page.locator('#enter').innerText()).includes('继续'));
 await page.locator('#enter').click();await page.waitForFunction(()=>window.garden.getDiagnostics().navigation==='walk');check('便携包刷新保留实际经历',await page.evaluate(()=>window.garden.getNarrativeState().completed.includes('painting')));
 const build=JSON.parse(await readFile(path.join(root,'build.json'),'utf8'));await page.screenshot({path:'output/qa/journey-package.png'});
 await writeFile('output/qa/package.json',JSON.stringify({passed:true,fingerprint:build.fingerprint,checks,errors},null,2));
 console.log(JSON.stringify({passed:!errors.length,fingerprint:build.fingerprint,checks,errors}));if(errors.length)process.exitCode=1;
}catch(error){await writeFile('output/qa/package.json',JSON.stringify({passed:false,checks,errors,failure:error.message},null,2));console.error(error.message);process.exitCode=1;}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
