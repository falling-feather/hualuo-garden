import{readFile,writeFile,mkdir,copyFile,readdir}from'node:fs/promises';
import path from'node:path';
import{createHash}from'node:crypto';
const root=process.cwd(),staging=path.join(root,'tmp/judging-package'),web=path.join(staging,'web'),out=path.join(root,'output/delivery');
await mkdir(web,{recursive:true});await mkdir(out,{recursive:true});
if((await readdir(web)).length)throw new Error('暂存发布目录非空。核对其属于本项目后清理，再生成当前构建，避免混入旧资源。');
const manifest=JSON.parse(await readFile('dist/garden.manifest.json','utf8'));
const resources=new Set(['index.html','garden.manifest.json','garden-poster.png','favicon.svg','textures/water-normal.png','reference/daguanyuan-reference.pdf','story/credits.json','draco/draco_decoder.js','draco/draco_decoder.wasm','draco/draco_wasm_wrapper.js']);
for(const file of await readdir('dist/assets'))resources.add('assets/'+file);
for(const url of [manifest.worldUrl,...manifest.worldChunks.map(c=>c.url),...manifest.landmarks.flatMap(l=>[l.url,l.lodUrl])]){
 const relative=url.replace(/^\//,'');resources.add(relative);const bytes=await readFile(path.join(root,'dist',relative)),json=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
 for(const image of json.images??[]){if(!image.uri||/^(https?:|data:)/.test(image.uri))throw new Error('便携包要求所有模型图像都有本地引用');resources.add(new URL(image.uri,'http://garden.local/'+relative).pathname.replace(/^\//,''));}
}
const credits=JSON.parse(await readFile('public/story/credits.json','utf8'));for(const image of Object.values(credits.images))resources.add(image.url.replace(/^\//,''));
const entries=[];
for(const relative of [...resources].sort()){
 const source=path.resolve(root,'dist',relative),destination=path.resolve(web,relative);
 if(!source.startsWith(path.join(root,'dist')+path.sep)||!destination.startsWith(web+path.sep))throw new Error('资源越出发布目录');
 const bytes=await readFile(source);await mkdir(path.dirname(destination),{recursive:true});await copyFile(source,destination);entries.push({path:relative,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
const fingerprint=createHash('sha256').update(entries.map(e=>e.path+'\0'+e.sha256).join('\n')).digest('hex');
const build={schema:1,createdAt:new Date().toISOString(),fingerprint,worldBuild:manifest.assetBuild.id,files:entries,bytes:entries.reduce((s,e)=>s+e.bytes,0)};
await writeFile(path.join(out,'build.json'),JSON.stringify(build,null,2)+'\n','utf8');await copyFile(path.join(out,'build.json'),path.join(staging,'build.json'));
await copyFile('scripts/local-preview.mjs',path.join(staging,'serve.mjs'));
await mkdir(path.join(staging,'来源'),{recursive:true});
await copyFile('art/surface-sources.json',path.join(staging,'来源/实拍表面.json'));await copyFile('public/story/credits.json',path.join(staging,'来源/故事图像.json'));
await copyFile('node_modules/three/LICENSE',path.join(staging,'来源/Three.js-MIT.txt'));
await writeFile(path.join(staging,'启动游园.cmd'),'@echo off\r\nchcp 65001 >nul\r\ncd /d "%~dp0"\r\nwhere node >nul 2>&1\r\nif errorlevel 1 (\r\n echo 请先安装Node.js 18或更新版本，再打开此文件。\r\n pause\r\n exit /b 1\r\n)\r\nnode serve.mjs --port 5426\r\npause\r\n','utf8');
console.log(JSON.stringify({files:entries.length,bytes:build.bytes,fingerprint,staging}));
