import {spawn} from 'node:child_process';
import {createWriteStream,existsSync} from 'node:fs';
import {mkdir,copyFile,readFile,writeFile,rename,stat,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const firstExisting=paths=>paths.find(candidate=>candidate&&existsSync(candidate));
const blender=firstExisting([process.env.BLENDER_BIN,'D:/steam/steamapps/common/Blender/blender.exe',path.join(process.env.ProgramFiles??'C:/Program Files','Blender Foundation/Blender 5.2/blender.exe')]);
const python=process.env.GARDEN_PYTHON??'python';
const args=process.argv.slice(2);
const onlyIndex=args.indexOf('--only');
const only=onlyIndex>=0?args[onlyIndex+1]:args.find(arg=>arg.startsWith('--only='))?.slice(7);
const preview=args.includes('--preview-only');
const worldOnly=args.includes('--no-export');
const resume=args.includes('--resume');
let buildId=randomUUID();
const rawRoot=path.join(root,'tmp/raw-models');
const manifestPath=path.join(root,'public/garden.manifest.json');
if(args.some(arg=>arg==='--build-id'||arg.startsWith('--build-id=')))throw new Error('--build-id 由本次构建生成，不能复用旧导出身份。');
if(onlyIndex>=0&&(!only||only.startsWith('--')))throw new Error('--only 需要一个建筑 ID。');
if(preview&&!only)throw new Error('--preview-only 需要 --only 指定单体。');
if(only&&worldOnly&&!preview)throw new Error('--only 与 --no-export 没有需要发布的模型；单体检查请使用 --preview-only。');
if(resume){
  if(preview)throw new Error('检查图不发布资产，不支持 --resume。');
  const receiptPath=path.join(rawRoot,'build-receipt.json'),receipt=JSON.parse(await readFile(receiptPath,'utf8'));
  if(receipt.only!==(only??null)||receipt.worldOnly!==worldOnly||typeof receipt.buildId!=='string')throw new Error('恢复范围与原生导出回执不一致；请使用原来的 --only／--no-export 参数。');
  const receiptTime=(await stat(receiptPath)).mtimeMs;
  const sources=[path.join(root,'art/garden-plan.json'),...(await readdir(path.join(root,'art/blender'))).filter(name=>name.endsWith('.py')).map(name=>path.join(root,'art/blender',name))];
  if((await Promise.all(sources.map(file=>stat(file)))).some(info=>info.mtimeMs>receiptTime))throw new Error('原生源在导出之后已修改，不能恢复旧导出；请重新构建。');
  buildId=receipt.buildId;
}
if(!blender)throw new Error('未找到 Blender。请将 BLENDER_BIN 指向 Blender 5.2 的可执行文件。');
for(const folder of ['tmp/raw-models','art/textures','art/scenes','art/landmarks','public/models','public/textures','public/draco','public/reference','output/previews','output/qa'])await mkdir(path.join(root,folder),{recursive:true});
const plan=JSON.parse(await readFile(path.join(root,'art/garden-plan.json'),'utf8'));
if(only&&!plan.landmarks.some(item=>item.id===only))throw new Error('未知单体：'+only);
const previous=!preview&&(only||worldOnly)?JSON.parse(await readFile(manifestPath,'utf8')):null;
if(previous&&previous.assetBuild?.format!=='external-textures-v1')throw new Error('新优化管线须先执行一次完整 npm run assets，之后才能定向重建。');

async function run(command,parameters,logName,filtered=false) {
  const log=createWriteStream(path.join(root,'tmp',logName),{encoding:'utf8'});
  const child=spawn(command,parameters,{cwd:root,windowsHide:true,env:{...process.env,PYTHONUTF8:'1'},stdio:['ignore','pipe','pipe']});
  let pending='',tail=[];
  const receive=data=>{
    const text=data.toString('utf8');log.write(text);pending+=text;
    const lines=pending.split(/\r?\n/);pending=lines.pop()??'';
    for(const line of lines){
      tail.push(line);if(tail.length>35)tail.shift();
      if(!filtered||/^(ASSET |ROUTE_LAYOUT |RENDER_DEVICE |BUILD_COMPLETE |Error|Traceback|.*Exception:)/.test(line))console.log(line);
    }
  };
  child.stdout.on('data',receive);child.stderr.on('data',receive);
  await new Promise((resolve,reject)=>{
    child.once('error',reject);
    child.once('exit',code=>code===0?resolve():reject(new Error('资产构建退出码 '+code+'\n'+tail.join('\n'))));
  }).finally(()=>log.end());
}

if(!resume){
  await run(python,['-X','utf8',path.join(root,'art/blender/make_textures.py')],'texture-build.log');
  if(!only)await run(blender,['--background','--factory-startup','--python-exit-code','1','--python',path.join(root,'scripts/inspect-routes.py'),'--','--strict'],'route-layout.log',true);
  await run(blender,['--background','--factory-startup','--python-exit-code','1','--python',path.join(root,'art/blender/build_scene.py'),'--',...args,'--build-id',buildId],'blender-build.log',true);
}else console.log('恢复已完成的原生导出，继续现有离线优化与清单发布。');
if(preview){
  console.log('单体检查图已写入 output/previews；集成资产保持原版本。');
}else{
  const receipt=JSON.parse(await readFile(path.join(rawRoot,'build-receipt.json'),'utf8'));
  const expected=only?[only+'.glb',only+'.lod.glb']:worldOnly?['garden.glb']:[...plan.landmarks.flatMap(item=>[item.id+'.glb',item.id+'.lod.glb']),'garden.glb'];
  if(receipt.buildId!==buildId||receipt.only!==(only??null)||receipt.worldOnly!==worldOnly||JSON.stringify([...receipt.files].sort())!==JSON.stringify([...expected].sort()))throw new Error('原始导出回执与本次范围不一致；拒绝优化旧 raw 文件。');
  const candidate=JSON.parse(await readFile(path.join(rawRoot,'garden.manifest.json'),'utf8'));
  let manifest=candidate;
  if(only){
    const updated=candidate.landmarks[0];
    const original=previous.landmarks.find(item=>item.id===only);
    for(const field of ['position','rotation','size','ports'])if(JSON.stringify(updated[field])!==JSON.stringify(original[field]))throw new Error(only+' 的 '+field+' 已影响世界连接，请改用完整资产构建。');
    manifest={...previous,
      landmarks:previous.landmarks.map(item=>item.id===only?updated:item),
      colliders:[...previous.colliders.filter(item=>item.landmarkId!==only),...candidate.colliders],
      surfaces:[...previous.surfaces.filter(item=>item.landmarkId!==only),...candidate.surfaces],
    };
  }
  const filesPath=path.join(rawRoot,'optimize-files.json');
  const reportPath=path.join(root,'output/qa/asset-optimization.json');
  await writeFile(filesPath,JSON.stringify(expected.map(name=>path.join(rawRoot,name)),null,2),'utf8');
  await run(process.execPath,[path.join(root,'scripts/optimize-assets.mjs'),'--input',rawRoot,'--output',path.join(root,'public/models'),'--files',filesPath,'--report',reportPath],'asset-optimization.log');
  const optimized=JSON.parse(await readFile(reportPath,'utf8'));
  if(optimized.schema!==1||!expected.every(name=>optimized.files?.some(file=>file.name===name)))throw new Error('优化报告未覆盖本次全部原始模型；不发布候选 manifest。');
  if(!only){
    if(!Array.isArray(optimized.worldChunks)||!optimized.worldChunks.length)throw new Error('世界优化报告缺少分区清单；不发布候选 manifest。');
    manifest.worldChunks=optimized.worldChunks;
    manifest.worldUrl=optimized.files.find(file=>file.name==='garden.glb').url;
  }
  for(const landmark of manifest.landmarks){
    if(worldOnly){const original=previous.landmarks.find(item=>item.id===landmark.id);landmark.url=original.url;landmark.lodUrl=original.lodUrl;}
    const high=optimized.files.find(file=>file.name===landmark.id+'.glb'),low=optimized.files.find(file=>file.name===landmark.id+'.lod.glb');
    if(high)landmark.url=high.url;if(low)landmark.lodUrl=low.url;
    landmark.bytes=(await stat(path.join(root,'public',landmark.url.slice(1)))).size;
  }
  const landmarkBuildIds=only||worldOnly?{...previous.assetBuild.landmarkBuildIds}:{};
  for(const item of manifest.landmarks)if(!worldOnly&&(!only||item.id===only))landmarkBuildIds[item.id]=buildId;
  manifest.assetBuild={format:'external-textures-v1',id:buildId,scope:only?'landmark':worldOnly?'world':'full',createdAt:new Date().toISOString(),
    worldBuildId:only?previous.assetBuild.worldBuildId:buildId,landmarkBuildIds,nativeMasterSynchronized:!only&&!worldOnly};
  const pendingManifest=path.join(root,'public/garden.manifest.pending.json');
  await writeFile(pendingManifest,JSON.stringify(manifest),'utf8');
  await rename(pendingManifest,manifestPath);
  for(const filename of ['draco_decoder.js','draco_decoder.wasm','draco_wasm_wrapper.js'])await copyFile(path.join(root,'node_modules/three/examples/jsm/libs/draco/gltf',filename),path.join(root,'public/draco',filename));
  await copyFile(path.join(root,'doc/01-子文档/11-大观园原著空间参考.pdf'),path.join(root,'public/reference/daguanyuan-reference.pdf'));
  if(!only&&args.includes('--render'))await copyFile(path.join(root,'output/previews/garden-overview.png'),path.join(root,'public/garden-poster.png'));
  console.log('本次 '+expected.length+' 件原始模型已完成离线优化并更新清单；原生模型保留在 art。'+(only?' 单体更新未重建全园主文件，交付前仍须完整构建。':''));
}
