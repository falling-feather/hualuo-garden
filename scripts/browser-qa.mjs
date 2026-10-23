import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const browser=await chromium.launch({channel:'msedge',headless:true,args:process.argv.includes('--high-gpu')?['--force_high_performance_gpu']:[]});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
const errors=[];
const warnings=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{if(response.status()>=400)errors.push(response.status()+' '+response.url());});
page.on('console',message=>{
  if(message.type()==='error')errors.push(message.text().slice(0,1600));
  if(message.type()==='warning')warnings.push(message.text().slice(0,400));
});
const result={browser:'Microsoft Edge / headless',screens:[],errors,warnings,checks:[]};
const settle=async(frames=45)=>{
  const target=await page.evaluate(n=>window.garden.getDiagnostics().frames+n,frames);
  await page.waitForFunction(n=>window.garden.getDiagnostics().frames>=n,target,{timeout:60000});
};
try{
  await page.goto('http://127.0.0.1:5416/',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true'||!document.getElementById('error').hidden,null,{timeout:120000});
  if(await page.locator('#error').isVisible())throw new Error(await page.locator('#error-text').innerText());
  await page.locator('#enter').click();
  await page.waitForFunction(()=>window.garden?.getState().activeLandmark==='gate',null,{timeout:30000});
  await page.evaluate(()=>window.garden.ready);
  await page.evaluate(()=>window.garden.focus('xiaoxiang','overview'));
  await settle();
  await page.screenshot({path:path.join(root,'output/qa/browser-xiaoxiang.png')});
  result.screens.push('browser-xiaoxiang.png');
  result.initial=await page.evaluate(()=>window.garden.getDiagnostics());
  result.renderer=await page.evaluate(()=>{
    const gl=document.querySelector('canvas').getContext('webgl2');
    const extension=gl?.getExtension('WEBGL_debug_renderer_info');
    return {renderer:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):'unavailable',version:gl?.getParameter(gl.VERSION)};
  });
  result.checks.push({name:'全部基础资产载入',pass:result.initial.loadedLandmarks===22&&result.initial.ready});
  await page.locator('#time-toggle').click();
  await page.locator('[data-hour="22"]').click();
  await page.locator('[data-close="time"]').click();
  await page.evaluate(()=>window.garden.focus('ouxiang','overview'));
  await settle();
  await page.screenshot({path:path.join(root,'output/qa/browser-moon.png')});
  result.screens.push('browser-moon.png');
  result.checks.push({name:'月夜时间按钮',pass:(await page.evaluate(()=>window.garden.getState().hour))===22});
  await page.locator('#time-toggle').click();
  await page.locator('[data-weather="snow"]').click();
  await page.locator('[data-hour="13.5"]').click();
  await page.locator('[data-close="time"]').click();
  await page.evaluate(()=>window.garden.focus('longcui','overview'));
  await settle();
  await page.screenshot({path:path.join(root,'output/qa/browser-snow.png')});
  result.screens.push('browser-snow.png');
  result.checks.push({name:'飞雪与冬景',pass:(await page.evaluate(()=>window.garden.getState().weather))==='snow'});
  await page.evaluate(()=>window.garden.focus('qiushuang','interior'));
  await settle(24);
  await page.screenshot({path:path.join(root,'output/qa/browser-interior-snow.png')});
  result.screens.push('browser-interior-snow.png');
  for(const weather of ['rain','mist']){
    await page.evaluate(value=>{window.garden.setSeason('summer');window.garden.setWeather(value);},weather);
    await page.evaluate(()=>window.garden.focus('yihong','courtyard'));
    await settle(24);
    await page.screenshot({path:path.join(root,'output/qa/browser-'+weather+'.png')});
    result.screens.push('browser-'+weather+'.png');
    result.checks.push({name:weather==='rain'?'细雨状态与渲染':'薄雾状态与渲染',pass:(await page.evaluate(()=>window.garden.getState().weather))===weather});
  }
  await page.evaluate(()=>window.garden.focus('longcui','overview'));
  await page.locator('#read').click();
  await page.waitForFunction(()=>document.getElementById('reading-dialog').open);
  result.checks.push({name:'原文阅读',pass:(await page.locator('#reading-name').innerText())==='栊翠庵'});
  await page.locator('#return-garden').click();
  await page.evaluate(async()=>{
    const received=[];
    const handler=event=>received.push(event.detail.id);
    window.garden.addEventListener('garden:interact',handler);
    const remove=window.garden.registerInteraction({id:'qa-reading',landmarkId:'xiaoxiang',label:'测试接口',position:[0,1,0],kind:'object'});
    await window.garden.activateInteraction('qa-reading');
    remove();window.garden.removeEventListener('garden:interact',handler);
    if(received[0]!=='qa-reading')throw new Error('交互事件接口没有响应');
  });
  result.checks.push({name:'外部交互注册、事件与注销',pass:true});
  await page.evaluate(()=>{window.garden.setWeather('clear');window.garden.setSeason('spring');window.garden.setTime(8.2);});
  await page.evaluate(()=>window.garden.focus('gate','courtyard'));
  await page.locator('#walk-toggle').click();
  const before=await page.evaluate(()=>window.garden.getDiagnostics().navigation);
  const positionBefore=await page.evaluate(()=>window.garden.getDiagnostics().cameraPosition);
  await page.keyboard.down('w');
  await settle(25);
  await page.keyboard.up('w');
  const positionAfter=await page.evaluate(()=>window.garden.getDiagnostics().cameraPosition);
  result.checks.push({name:'WASD 实际改变步行位置',pass:Math.hypot(positionAfter[0]-positionBefore[0],positionAfter[2]-positionBefore[2])>.25});
  await page.keyboard.press('Escape');
  result.checks.push({name:'漫步与退出',pass:before==='walk'&&(await page.evaluate(()=>window.garden.getDiagnostics().navigation))==='orbit'});
  await page.locator('#sound-toggle').click();
  result.checks.push({name:'用户启用环境声',pass:await page.evaluate(()=>document.documentElement.dataset.sound==='on')});
  await page.locator('#sound-toggle').click();
  await page.locator('#map-toggle').click();
  result.checks.push({name:'导览面板遮挡处理',pass:await page.locator('#caption').evaluate(node=>getComputedStyle(node).visibility==='hidden')});
  await page.locator('[data-close="map"]').click();
  await page.evaluate(()=>window.garden.focus('ouxiang','courtyard'));
  await page.locator('#walk-toggle').click();
  const bridgeStart=await page.evaluate(()=>window.garden.getDiagnostics().cameraPosition);
  await page.keyboard.down('w');
  try{await page.waitForFunction(start=>{const p=window.garden.getDiagnostics().cameraPosition;return Math.hypot(p[0]-start[0],p[2]-start[2])>11.5;},bridgeStart,{timeout:15000});}
  finally{await page.keyboard.up('w');}
  const bridgeEnd=await page.evaluate(()=>window.garden.getDiagnostics().cameraPosition);
  result.checks.push({name:'从西桥穿过藕香榭到东桥',pass:bridgeEnd[1]>2.0});
  await page.screenshot({path:path.join(root,'output/qa/browser-ouxiang-walk.png')});
  result.screens.push('browser-ouxiang-walk.png');
  await page.keyboard.down('s');
  try{await page.waitForFunction(start=>{const p=window.garden.getDiagnostics().cameraPosition;return Math.hypot(p[0]-start[0],p[2]-start[2])<1;},bridgeStart,{timeout:15000});}
  finally{await page.keyboard.up('s');}
  result.checks.push({name:'藕香榭双向桥面连续漫步',pass:true});
  await page.keyboard.press('Escape');
  const allIds=await page.evaluate(()=>window.garden.getLandmarks().map(item=>item.id));
  const streamingSamples=[];
  for(const id of allIds){
    await page.evaluate(id=>window.garden.focus(id,'overview'),id);
    await settle(12);
    const sample=await page.evaluate(()=>window.garden.getDiagnostics());
    streamingSamples.push({id,cachedBuildings:sample.highDetail.length,...sample.streaming});
  }
  result.checks.push({name:'全部 22 处分项精模可加载',pass:true});
  result.streaming={maxCachedBuildings:Math.max(...streamingSamples.map(s=>s.cachedBuildings)),maxCachedTiles:Math.max(...streamingSamples.map(s=>s.loadedWorldTiles.length)),maxBuildingGeometryMB:Math.max(...streamingSamples.map(s=>s.detailGeometryMB)),maxTileGeometryMB:Math.max(...streamingSamples.map(s=>s.worldDetailGeometryMB)),sharedTextures:streamingSamples.at(-1).sharedTextures};
  result.checks.push({name:'游览中按距离补足相邻院落精模',pass:streamingSamples.some(s=>s.activeDetail.some(id=>id!==s.id))});
  result.checks.push({name:'世界近区分片实际载入且缓存有界',pass:streamingSamples.some(s=>s.loadedWorldTiles.length>0)&&result.streaming.maxCachedTiles<=6});
  result.checks.push({name:'精模缓存释放，返回时可重新加载',pass:result.streaming.maxCachedBuildings<=3&&result.streaming.maxBuildingGeometryMB<=96});
  const detailViews=[...['hengwu','zhuijinlou','daguanlou','ouxiang','qinfang','luxue','dicui','cubi'].map(id=>[id,'overview']),...['xiaoxiang','yihong','hengwu','qiushuang','nuanxiang','zhuijinlou','longcui','luxue'].map(id=>[id,'interior'])];
  for(const [id,view] of detailViews){
    await page.evaluate(([id,view])=>window.garden.focus(id,view),[id,view]);
    await settle(15);
    const filename='browser-'+id+(view==='interior'&&id!=='qiushuang'?'-interior':'')+'.png';
    await page.screenshot({path:path.join(root,'output/qa',filename)});
    result.screens.push(filename);
  }
  await page.evaluate(()=>window.garden.overview());
  await settle();
  await page.screenshot({path:path.join(root,'output/qa/browser-overview.png')});
  result.screens.push('browser-overview.png');
  result.final=await page.evaluate(()=>window.garden.getDiagnostics());
  result.checks.push({name:'全园远景退出近区精模',pass:result.final.streaming.activeWorldTiles.length===0&&result.final.streaming.activeDetail.length===0});
  const imageRequests=await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>new URL(r.name).pathname.startsWith('/models/textures/')).map(r=>r.name));
  result.checks.push({name:'共享贴图跨院落与分区只请求一次',pass:imageRequests.length===new Set(imageRequests).size});
  await page.setViewportSize({width:390,height:844});
  await page.locator('#time-toggle').click();
  await page.screenshot({path:path.join(root,'output/qa/browser-mobile.png')});
  result.screens.push('browser-mobile.png');
  const panel=await page.locator('#time-panel').boundingBox();
  result.checks.push({name:'窄屏控制面板不溢出',pass:!!panel&&panel.x>=0&&panel.x+panel.width<=390});
}catch(error){result.failure=String(error);await page.screenshot({path:path.join(root,'output/qa/browser-failure.png')}).catch(()=>{});}
await writeFile(path.join(root,'output/qa/browser-qa.json'),JSON.stringify(result,null,2),'utf8');
console.log(JSON.stringify(result));
await browser.close();
if(result.failure||errors.length||result.checks.some(check=>!check.pass))process.exitCode=1;
