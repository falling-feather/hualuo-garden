import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
const label=process.argv.includes('--before')?'before':process.argv.includes('--study')?'study':'after';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--force_high_performance_gpu']});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});const report={label,errors:[],views:[],checks:[]};
page.on('pageerror',e=>{report.errors.push(e.message);page.evaluate(()=>document.documentElement.dataset.failed='true').catch(()=>{});});page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+new URL(r.url()).pathname);});
page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text().slice(0,1000));});
try{
 for(const view of ['close','ground','far']){
  await page.goto('http://127.0.0.1:5416/vegetation-review.html?source='+(label==='study'?'study':'full')+'&view='+view);
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true'||document.documentElement.dataset.failed==='true',null,{timeout:120000});
  if(report.errors.length)throw new Error(report.errors.join('; '));
  const frame=await page.evaluate(()=>window.vegetationReview.diagnostics().frames);
  await page.waitForFunction(n=>window.vegetationReview.diagnostics().frames>n+90,frame,{timeout:60000});
  await page.screenshot({path:'output/qa/vegetation-'+label+'-'+view+'.png'});
  report.views.push({view,...await page.evaluate(()=>window.vegetationReview.diagnostics())});
  if(view==='close'&&label==='after'){
    const leaves=await page.evaluate(async()=>{
      const viewer=window.vegetationReview;
      function visible(){let count=0;viewer.assets.group.traverse(object=>{if(object.isBatchedMesh&&object.material.name==='leaf')for(let i=0;i<object.instanceCount;i++)if(object.getVisibleAt(i))count++;});return count;}
      const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const autumn=visible();viewer.state.setSeason('winter');await frame();const winter=visible();viewer.state.setSeason('autumn');await frame();return {autumn,winter,restored:visible()};
    });
    report.checks.push({name:'冬季退叶，回到秋季恢复',pass:leaves.winter<leaves.autumn&&leaves.restored===leaves.autumn,...leaves});
  }
 }
}finally{await browser.close();await writeFile('output/qa/vegetation-'+label+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify({label,errors:report.errors,checks:report.checks,views:report.views.map(v=>({view:v.view,fps:v.fps,triangles:v.renderedTriangles}))}));if(report.errors.length||report.checks.some(c=>!c.pass))process.exitCode=1;}
