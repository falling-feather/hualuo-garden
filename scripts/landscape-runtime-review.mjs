import{chromium}from'playwright';
import{spawn}from'node:child_process';
import{mkdir,writeFile}from'node:fs/promises';
import{resolve,join}from'node:path';

const output=resolve(process.argv[2]??'output/qa/landscape-20261023-am');
const crownStudy=process.argv.includes('--crown');
await mkdir(output,{recursive:true});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','5417','--strictPort'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
let browser;
const report={environment:'共享Windows机器，单个本项目Edge页面，独显优先；后台用户应用未关闭；短时检查，不代表独占基准',errors:[],views:[],transitions:[]};
try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('预览超时')),15000);server.once('error',reject);server.stdout.on('data',chunk=>{if(chunk.toString().includes('5417')){clearTimeout(timer);resolve();}});});
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--force_high_performance_gpu']});
 const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 if(crownStudy)await page.addInitScript(()=>{
  const result=window.__gardenSkyTrace={environmentPrograms:0,environmentDraws:0},prototype=WebGL2RenderingContext.prototype,programs=new WeakSet();let active=false;
  const link=prototype.linkProgram,use=prototype.useProgram;
  prototype.linkProgram=function(program){link.call(this,program);const code=(this.getAttachedShaders(program)??[]).map(shader=>this.getShaderSource(shader)).join('\n');if(code.includes('#define USE_ENVMAP')&&code.includes('#define ENVMAP_TYPE_CUBE_UV')){programs.add(program);result.environmentPrograms++;}};
  prototype.useProgram=function(program){active=programs.has(program);return use.call(this,program);};
  for(const method of['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){const draw=prototype[method];prototype[method]=function(...args){if(active)result.environmentDraws++;return draw.apply(this,args);};}
 });
 page.on('pageerror',error=>report.errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text().slice(0,700));});
 page.on('response',response=>{if(response.status()>=400)report.errors.push(response.status()+' '+new URL(response.url()).pathname);});
 await page.goto('http://127.0.0.1:5417/');
 await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',null,{timeout:120000});
 report.entry=await page.evaluate(()=>[...document.scripts].find(script=>script.type==='module')?.getAttribute('src'));
 report.renderer=await page.evaluate(()=>{const gl=document.getElementById('garden').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);});
 await page.locator('#enter').click();
 await page.waitForFunction(()=>window.garden.getNarrativeState().started&&!window.garden.getDiagnostics().transitioning);
 await page.evaluate(()=>{window.garden.setTime(9.5);window.garden.setWeather('clear');window.garden.setSeason('autumn');});
 const views=crownStudy?[['qinfang','painting'],['qinfang-shore','shore']]:[['overview',null],['qinfang','painting'],['qiushuang','banquet'],['longcui','tea']];
 for(const [name,id]of views){
  const metrics=await page.evaluate(async id=>{let previous=performance.now(),active=true;const intervals=[];const tick=t=>{intervals.push(t-previous);previous=t;if(active)requestAnimationFrame(tick);};requestAnimationFrame(tick);const start=performance.now();if(id==='shore')await window.garden.focus('qinfang','overview');else if(id)await window.garden.goToMemory(id);else await window.garden.overview();active=false;intervals.sort((a,b)=>a-b);return{elapsedMs:Math.round(performance.now()-start),frames:intervals.length,p95Ms:+(intervals[Math.floor(intervals.length*.95)]??0).toFixed(1),maxMs:+(intervals.at(-1)??0).toFixed(1)};},id);
  await page.waitForFunction(()=>!window.garden.getDiagnostics().transitioning&&!window.garden.getNarrativeState().traveling);
  const frames=await page.evaluate(()=>window.garden.getDiagnostics().frames);await page.waitForFunction(n=>window.garden.getDiagnostics().frames>n+45,frames,{timeout:60000});
  await page.screenshot({path:join(output,name+'.png')});
  const d=await page.evaluate(()=>window.garden.getDiagnostics());
  report.views.push({name,fps:d.fps,triangles:d.renderedTriangles,camera:d.cameraPosition});report.transitions.push({name,...metrics});console.log('场景 '+name+' '+JSON.stringify(metrics));
 }
 if(crownStudy)report.skyLightingTrace=await page.evaluate(()=>window.__gardenSkyTrace);
}catch(error){report.failure=error.message;process.exitCode=1;}finally{await browser?.close();server.kill();await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(report.errors.length)process.exitCode=1;}
