import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=path.join(root,'art','textures');
await mkdir(directory,{recursive:true});
const sources=[
  {id:'bark_brown_02',name:'bark',author:'Rob Tuytel',physicalWidthMeters:1},
  {id:'leafy_grass',name:'lawn',author:'Charlotte Baglioni',physicalWidthMeters:2},
];
const catalog=[];
for(const source of sources){
  const response=await fetch(`https://api.polyhaven.com/files/${source.id}`);
  if(!response.ok)throw new Error(`Poly Haven metadata: ${response.status}`);
  const metadata=await response.json(),maps=[];
  for(const [key,resolution,format,suffix] of [['Diffuse','2k','jpg','color.jpg'],['nor_gl','1k','png','normal.png'],['Rough','1k','jpg','roughness.jpg']]){
    const entry=metadata[key]?.[resolution]?.[format];
    if(!entry?.url||!entry.md5)throw new Error(`Missing verified ${source.id}/${key}`);
    const filename=`${source.name}-${suffix}`,destination=path.join(directory,filename);
    let bytes;try{bytes=await readFile(destination);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(!bytes||createHash('md5').update(bytes).digest('hex')!==entry.md5){
      const file=await fetch(entry.url);if(!file.ok)throw new Error(`Surface download: ${file.status}`);
      bytes=Buffer.from(await file.arrayBuffer());
      if(bytes.length!==entry.size||createHash('md5').update(bytes).digest('hex')!==entry.md5)throw new Error(`Surface checksum mismatch: ${filename}`);
      await writeFile(destination,bytes);
    }
    maps.push({file:`textures/${filename}`,type:key,resolution,url:entry.url,bytes:bytes.length,md5:entry.md5,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  catalog.push({...source,license:'CC0-1.0',source:`https://polyhaven.com/a/${source.id}`,maps});
}
await writeFile(path.join(root,'art','surface-sources.json'),JSON.stringify(catalog,null,2)+'\n','utf8');
console.log(JSON.stringify(catalog.map(({id,maps})=>({id,files:maps.length,bytes:maps.reduce((s,m)=>s+m.bytes,0)}))));
