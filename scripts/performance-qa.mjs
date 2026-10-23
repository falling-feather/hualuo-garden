import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';

const forced=process.argv.includes('--high-gpu');
const argument=(name,fallback)=>process.argv.find(value=>value.startsWith(name+'='))?.slice(name.length+1)??fallback;
const label=argument('--label','current');
if(!/^[a-z0-9-]+$/.test(label))throw new Error('Invalid report label');
const origin=argument('--url','http://127.0.0.1:5416');
const browser=await chromium.launch({channel:'msedge',headless:true,args:forced?['--force_high_performance_gpu']:[]});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
try {
  await page.addInitScript(()=>{
    window.__profile={longTasks:[],frames:[],sampling:false};
    new PerformanceObserver(list=>{
      for(const entry of list.getEntries())window.__profile.longTasks.push({start:entry.startTime,duration:entry.duration});
    }).observe({type:'longtask',buffered:true});
    let previous=0;
    const step=time=>{if(previous&&window.__profile.sampling)window.__profile.frames.push(time-previous);previous=time;requestAnimationFrame(step);};
    requestAnimationFrame(step);
  });
  await page.goto(origin);
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',null,{timeout:180000});
  const startup=await page.evaluate(()=>({
    readyMs:performance.now(),heapMB:performance.memory?.usedJSHeapSize/1048576,
    resources:performance.getEntriesByType('resource').filter(e=>/\.(glb|gltf|bin|webp|png|ktx2)(\?|$)/.test(e.name)).map(e=>({url:new URL(e.name).pathname,bytes:e.encodedBodySize,duration:e.duration})),
    longTasks:window.__profile.longTasks.slice(),diagnostics:window.garden.getDiagnostics(),
  }));
  const renderer=await page.evaluate(()=>{
    const gl=document.querySelector('#garden').getContext('webgl2'),extension=gl.getExtension('WEBGL_debug_renderer_info');
    return extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):'unavailable';
  });
  await page.locator('#enter').click();
  await page.waitForFunction(()=>!window.garden.getDiagnostics().transitioning&&window.garden.getDiagnostics().highDetail.includes('gate'));
  const results=[];
  for(const quality of ['fine','smooth']) {
    await page.evaluate(q=>{window.garden.setQuality(q);window.garden.setTime(9.5);window.garden.setSeason('spring');window.garden.setWeather('clear');},quality);
    for(const [id,view] of [['xiaoxiang','overview'],['yihong','courtyard'],['cubi','overview'],['overview','overview']]) {
      await page.evaluate(()=>{window.__profile.frames=[];window.__profile.sampling=true;window.__profile.phaseStart=performance.now();});
      await page.evaluate(({id,view})=>id==='overview'?window.garden.overview():window.garden.focus(id,view),{id,view});
      await page.waitForTimeout(3000);
      const sample=await page.evaluate(()=>{
        window.__profile.sampling=false;
        return {frames:window.__profile.frames,longTasks:window.__profile.longTasks.filter(t=>t.start>=window.__profile.phaseStart),diagnostics:window.garden.getDiagnostics(),heapMB:performance.memory?.usedJSHeapSize/1048576};
      });
      const frames=sample.frames,sorted=[...frames].sort((a,b)=>a-b);
      const percentile=p=>Number(sorted[Math.floor((sorted.length-1)*p)].toFixed(2));
      results.push({quality,id,view,frames:frames.length,fps:Number((1000/(frames.reduce((a,b)=>a+b,0)/frames.length)).toFixed(1)),p50Ms:percentile(.5),p95Ms:percentile(.95),p99Ms:percentile(.99),maxFrameMs:Math.max(...frames),over50ms:frames.filter(t=>t>50).length,longTaskMs:sample.longTasks.reduce((n,t)=>n+t.duration,0),heapMB:sample.heapMB,diagnostics:sample.diagnostics});
      if(quality==='fine'&&['xiaoxiang','overview','cubi'].includes(id))await page.screenshot({path:`output/qa/${label}-${id}.png`});
    }
  }
  const assetBuild=await page.evaluate(async()=>(await(await fetch('/garden.manifest.json')).json()).assetBuild);
  const report={label,measuredAt:new Date().toISOString(),assetBuild,browser:'Microsoft Edge / headless',viewport:[1440,1000],devicePixelRatio:1,forcedHighPerformanceGPU:forced,renderer,coldContext:true,startup,results,errors};
  await writeFile(`output/qa/performance-${label}${forced?'-high-gpu':''}.json`,JSON.stringify(report,null,2),'utf8');
  console.log(JSON.stringify({label,renderer,readyMs:Math.round(startup.readyMs),startupMB:startup.resources.reduce((n,r)=>n+r.bytes,0)/1048576,loadLongTaskMs:startup.longTasks.reduce((n,t)=>n+t.duration,0),results:results.map(({quality,id,fps,p95Ms,maxFrameMs,heapMB,diagnostics})=>({quality,id,fps,p95Ms,maxFrameMs,heapMB,triangles:diagnostics.renderedTriangles,calls:diagnostics.drawCalls})),errors}));
} finally {await browser.close();}
