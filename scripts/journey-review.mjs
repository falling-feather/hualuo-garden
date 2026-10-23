import {chromium}from'playwright';
import{writeFile}from'node:fs/promises';
const phase=process.argv.includes('--before')?'before':'after';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--force_high_performance_gpu']});
const page=await browser.newPage({viewport:{width:1366,height:768},deviceScaleFactor:1,reducedMotion:'reduce'}),errors=[],views=[];
page.on('pageerror',error=>errors.push(error.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+new URL(r.url()).pathname);});
try{
 await page.goto('http://127.0.0.1:5416/');await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',null,{timeout:120000});
 await page.locator('#enter').click();await page.waitForFunction(()=>window.garden.getNarrativeState().started&&window.garden.getDiagnostics().navigation==='walk');
 for(const [name,id]of [['gate',null],['qinfang','painting'],['qiushuang','banquet'],['longcui','tea']]){
  if(id)await page.evaluate(id=>window.garden.goToMemory(id),id);
  await page.waitForFunction(()=>!window.garden.getDiagnostics().transitioning&&!window.garden.getNarrativeState().traveling);
  const n=await page.evaluate(()=>window.garden.getDiagnostics().frames);await page.waitForFunction(n=>window.garden.getDiagnostics().frames>n+60,n,{timeout:60000});
  await page.screenshot({path:`output/qa/journey-${phase}-${name}.png`});views.push({name,...await page.evaluate(()=>window.garden.getDiagnostics())});
 }
}finally{await browser.close();await writeFile(`output/qa/journey-${phase}-views.json`,JSON.stringify({phase,errors,views},null,2));console.log(JSON.stringify({phase,errors,views:views.map(v=>({name:v.name,fps:v.fps}))}));if(errors.length)process.exitCode=1;}
