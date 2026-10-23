import {readFile,writeFile,mkdir,rename,stat,readdir,realpath} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {NodeIO,Logger} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import draco3d from 'draco3d';
import {MeshoptDecoder,MeshoptSimplifier} from 'meshoptimizer';
import {prepareDocument,documentWithNodes,statistics,simplifyFarVegetation,serializeSharedGlb,combineBounds,VEGETATION_ROLES} from './asset-optimizer.mjs';

function parseArgs(argv){
  const options={input:'tmp/raw-models',output:'public/models',report:'output/qa/web-assets.json',tileSize:32,farRatio:.22,farError:.06};
  for(let i=0;i<argv.length;i++){
    const flag=argv[i],value=argv[++i];if(value===undefined)throw new Error(`Missing value for ${flag}`);
    if(flag==='--input')options.input=value;else if(flag==='--output')options.output=value;else if(flag==='--report')options.report=value;else if(flag==='--files')options.files=value;
    else if(flag==='--tile-size')options.tileSize=Number(value);else if(flag==='--far-ratio')options.farRatio=Number(value);else if(flag==='--far-error')options.farError=Number(value);else throw new Error(`Unknown option: ${flag}`);
  }
  if(!(options.tileSize>0)||!(options.farRatio>0&&options.farRatio<=1)||!(options.farError>0))throw new Error('Invalid tile/LOD options');
  return options;
}

function inside(parent,child){const relative=path.relative(parent,child);return relative!==''&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);}
async function atomicWrite(filename,data){
  await mkdir(path.dirname(filename),{recursive:true});const temporary=filename+'.writing';await writeFile(temporary,data);
  const delays=[60,150,400,1000,1800];
  for(let attempt=0;;attempt++){
    try{await rename(temporary,filename);return;}
    catch(error){
      if(process.platform!=='win32'||!['EPERM','EBUSY'].includes(error.code)||attempt>=delays.length)throw error;
      await new Promise(resolve=>setTimeout(resolve,delays[attempt]));
    }
  }
}

export async function publishGLB(output,name,bytes){
  const hash=createHash('sha256').update(bytes).digest('hex').slice(0,16),parsed=path.parse(name);
  const published=path.join(parsed.dir,parsed.name+'.'+hash+'.glb'),filename=path.join(output,published);
  let existing=null;try{existing=await readFile(filename);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(existing){if(!existing.equals(bytes))throw new Error('Model content fingerprint mismatch: '+filename);}
  else await atomicWrite(filename,bytes);
  return published.replaceAll(path.sep,'/');
}

export async function optimizeAssets(options){
  const workspace=await realpath(process.cwd()),input=await realpath(path.resolve(options.input)),output=path.resolve(options.output),reportPath=path.resolve(options.report);
  if(!inside(workspace,input)||!inside(workspace,output)||!inside(workspace,reportPath)||input===output)throw new Error('Input/output/report must be distinct project-owned paths');
  await mkdir(output,{recursive:true});await mkdir(path.join(output,'textures'),{recursive:true});
  let requested;
  if(options.files){requested=options.files.endsWith('.json')?JSON.parse(await readFile(path.resolve(options.files),'utf8')):options.files.split(',').filter(Boolean);}
  else requested=(await readdir(input)).filter(name=>name.endsWith('.glb'));
  if(!Array.isArray(requested)||!requested.length)throw new Error('No GLB files selected');
  const selected=[];
  for(const value of requested){if(typeof value!=='string')throw new Error('File entries must be strings');const file=await realpath(path.isAbsolute(value)?value:path.join(input,value));if(!inside(input,file)||path.extname(file)!=='.glb')throw new Error('Selected file is outside raw input: '+value);selected.push(file);}
  if(new Set(selected).size!==selected.length)throw new Error('Duplicate input file');
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder':await draco3d.createDecoderModule(),'draco3d.encoder':await draco3d.createEncoderModule(),'meshopt.decoder':MeshoptDecoder,
  }).setLogger(new Logger(Logger.Verbosity.WARN));
  await MeshoptDecoder.ready;await MeshoptSimplifier.ready;
  const files=[],worldChunks=[],textureRegistry=new Map();let referencedTextureBytes=0;
  async function writeDocument(document,name,details={}){
    const nested=name.startsWith('garden-tiles/');
    const world=name==='garden.glb',low=name.endsWith('.lod.glb');
    // The apron and garden tiles must share one position grid at their common rim.
    const precision=world?{position:20,normal:10,texcoord:14}:low?{position:15,normal:10,texcoord:14}:{position:16,normal:12,texcoord:14};
    const volume=world?'scene':'mesh';
    const serialized=await serializeSharedGlb(io,document,{texturePrefix:nested?'../textures/':'textures/',precision,volume});
    for(const texture of serialized.textures){
      referencedTextureBytes+=texture.bytes.length;
      if(!textureRegistry.has(texture.hash)){
        const filename=path.join(output,'textures',texture.filename);let existing=null;
        try{existing=await readFile(filename);}catch(error){if(error.code!=='ENOENT')throw error;}
        if(existing){if(createHash('sha256').update(existing).digest('hex')!==texture.hash)throw new Error('Shared texture hash mismatch: '+filename);}
        else await atomicWrite(filename,texture.bytes);
        textureRegistry.set(texture.hash,{hash:texture.hash,bytes:texture.bytes.length,mimeType:texture.mimeType});
      }
    }
    const published=await publishGLB(output,name,serialized.bytes);
    const info={name,url:'/models/'+published,bytes:serialized.bytes.length,precision,volume,...details,...statistics(document)};files.push(info);return info;
  }
  for(const filename of selected){
    const started=performance.now(),name=path.basename(filename),world=name==='garden.glb',id=world?'garden':name.replace(/(?:\.lod)?\.glb$/,'');
    const raw=await readFile(filename),rawJSON=JSON.parse(raw.toString('utf8',20,20+raw.readUInt32LE(12)));
    const sourceAccessorTriangles=(rawJSON.meshes??[]).reduce((sum,mesh)=>sum+mesh.primitives.reduce((n,p)=>n+(rawJSON.accessors[p.indices]?.count??rawJSON.accessors[p.attributes.POSITION].count)/3,0),0);
    const document=await io.read(filename);const initial={...await prepareDocument(document,{id,world,tileSize:options.tileSize}),sourceAccessorTriangles};
    const inputBytes=(await stat(filename)).size;
    if(!world){await writeDocument(document,name,{inputBytes,...initial});}
    else{
      const nodes=document.getRoot().listNodes().filter(node=>node.getMesh()),tiles=new Map();
      let staticTriangles=0,nearVegetationTriangles=0;
      for(const node of nodes){const extras=node.getExtras();if(VEGETATION_ROLES.has(extras.gardenRole)){const list=tiles.get(extras.detailTile)??[];list.push(node);tiles.set(extras.detailTile,list);for(const primitive of node.getMesh().listPrimitives())nearVegetationTriangles+=primitive.getIndices().getCount()/3;}else for(const primitive of node.getMesh().listPrimitives())staticTriangles+=primitive.getIndices().getCount()/3;}
      for(const [tile,tileNodes]of [...tiles].sort(([a],[b])=>a.localeCompare(b))){
        const tileDocument=documentWithNodes(document,tileNodes,'garden-'+tile),bounds=combineBounds(tileNodes.map(node=>node.getExtras().bounds));
        const trianglesBefore=tileNodes.reduce((sum,node)=>sum+node.getExtras().sourceTriangleCount,0),removedDegenerateTriangles=tileNodes.reduce((sum,node)=>sum+node.getExtras().removedDegenerateTriangles,0);
        const sourceRoleTriangles={};
        for(const node of tileNodes){const extras=node.getExtras();sourceRoleTriangles[extras.gardenRole]=(sourceRoleTriangles[extras.gardenRole]??0)+extras.sourceTriangleCount;}
        const info=await writeDocument(tileDocument,`garden-tiles/${tile}.glb`,{kind:'world-tile',sourceName:name,trianglesBefore,removedDegenerateTriangles,sourceRoleTriangles});
        worldChunks.push({id:tile,url:info.url,bounds,bytes:info.bytes,triangles:info.triangles});
      }
      const base=documentWithNodes(document,nodes,'garden');
      const simplification=await simplifyFarVegetation(base,MeshoptSimplifier,{ratio:options.farRatio,errorMeters:options.farError});
      const farVegetationTriangles=simplification.reduce((sum,item)=>sum+item.after,0);
      await writeDocument(base,name,{inputBytes,...initial,staticTriangles,nearVegetationTriangles,farVegetationTriangles,
        removedFarVegetationDegenerateTriangles:simplification.reduce((sum,item)=>sum+item.removedDegenerateTriangles,0),
        farVegetationTrianglesBeforeCleanup:simplification.reduce((sum,item)=>sum+item.after+item.removedDegenerateTriangles,0),
        farTargetRatio:options.farRatio,farActualRatio:nearVegetationTriangles?farVegetationTriangles/nearVegetationTriangles:1,farErrorLimitMeters:options.farError,
        groveFoliagePolicy:{method:'whole-leaf-coverage',retainedRatio:Math.max(.4,options.farRatio),retainedVertexDisplacementLimitMeters:options.farError},
        farMaximumReportedErrorMeters:Math.max(0,...simplification.map(item=>item.errorMeters))});
    }
    console.log('OPTIMIZED',JSON.stringify({name,elapsedMs:Math.round(performance.now()-started),sourceTriangles:initial.trianglesBefore,sourceMeshes:initial.meshesBefore}));
  }
  const report={schema:1,coordinates:'gltf-y-up',tileSize:options.tileSize,inputRoot:input,outputRoot:output,updatedFiles:selected.map(filename=>path.basename(filename)),files,worldChunks,
    textures:{scope:'current-invocation',unique:textureRegistry.size,bytes:[...textureRegistry.values()].reduce((sum,item)=>sum+item.bytes,0),referencedBytes:referencedTextureBytes,
      duplicateBytesAvoided:referencedTextureBytes-[...textureRegistry.values()].reduce((sum,item)=>sum+item.bytes,0)}};
  await atomicWrite(reportPath,JSON.stringify(report,null,2)+'\n');
  console.log('WEB_ASSETS',JSON.stringify({report:reportPath,files:files.length,worldChunks:worldChunks.length,textures:report.textures}));
  return report;
}

if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
  optimizeAssets(parseArgs(process.argv.slice(2))).catch(error=>{console.error(error.stack??error);process.exitCode=1;});
}
