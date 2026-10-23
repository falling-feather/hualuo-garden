import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {optimizeAssets} from './optimize-assets.mjs';
const report=await optimizeAssets({input:'tmp/vegetation-study',output:'public/review',report:'tmp/vegetation-study/report.json',files:'garden.glb',tileSize:32,farRatio:.22,farError:.06});
const manifest=JSON.parse(await readFile('tmp/vegetation-study/manifest.json','utf8'));
manifest.worldUrl=report.files.find(f=>f.name==='garden.glb').url.replace('/models/','/review/');
manifest.worldChunks=report.worldChunks.map(chunk=>({...chunk,url:chunk.url.replace('/models/','/review/')}));
await mkdir('public/review',{recursive:true});
await writeFile('public/review/vegetation.manifest.json',JSON.stringify(manifest),'utf8');
