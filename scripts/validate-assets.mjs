import {readFile,stat,writeFile,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import draco3d from 'draco3d';
import {MeshoptDecoder} from 'meshoptimizer';
import {VEGETATION_ROLES} from './asset-optimizer.mjs';

const root=process.cwd(),publicRoot=path.join(root,'public');
const manifest=JSON.parse(await readFile(path.join(publicRoot,'garden.manifest.json'),'utf8'));
const plan=JSON.parse(await readFile(path.join(root,'art/garden-plan.json'),'utf8'));
const failures=[],files=[],native=[],sourceChecks=[];
const fileRoles=new Map(),fileComponents=new Map(),fileSourceCounts=new Map(),uniqueTextures=new Map(),externalTextures=new Map();
let embeddedImages=0,externalImageReferences=0,finiteValues=0;
const inside=(parent,file)=>{const relative=path.relative(parent,file);return relative!==''&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);};
const realPublic=await realpath(publicRoot);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder':await draco3d.createDecoderModule(),
  'meshopt.decoder':MeshoptDecoder,
});
await MeshoptDecoder.ready;

function publicPath(url){
  if(typeof url!=='string'||!url.startsWith('/')||url.startsWith('//')||/[\\?#\0]/.test(url))throw new Error('非法本地资产 URL：'+url);
  const decoded=decodeURIComponent(url);
  if(/[\\?#\0]/.test(decoded))throw new Error('资产 URL 含转义路径或查询：'+url);
  const file=path.resolve(publicRoot,'.'+decoded);
  if(!inside(publicRoot,file))throw new Error('资产 URL 越出 public：'+url);
  return file;
}

async function relativeResource(owner,uri){
  if(typeof uri!=='string'||!uri||/^[a-z][a-z0-9+.-]*:/i.test(uri)||uri.startsWith('/')||/[\\?#\0]/.test(uri))throw new Error('外部资源必须使用相对文件 URI：'+uri);
  const decoded=decodeURIComponent(uri);
  if(/^[a-z][a-z0-9+.-]*:/i.test(decoded)||decoded.startsWith('/')||/[\\?#\0]/.test(decoded))throw new Error('非法转义资源 URI：'+uri);
  const file=path.resolve(path.dirname(owner),decoded);
  if(!inside(publicRoot,file)||!inside(realPublic,await realpath(file)))throw new Error('外部资源越出 public：'+uri);
  const info=await stat(file);
  if(!info.isFile()||!info.size)throw new Error('外部资源为空或不是普通文件：'+uri);
  return file;
}

function parseGLB(bytes){
  if(bytes.length<20||bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw new Error('GLB 头部或长度错误');
  let json=null,bin=null;
  for(let offset=12;offset<bytes.length;){
    if(offset+8>bytes.length)throw new Error('GLB 块头不完整');
    const length=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4),start=offset+8;
    if(length%4||start+length>bytes.length)throw new Error('GLB 块范围非法');
    if(type===0x4e4f534a){if(json)throw new Error('重复 JSON 块');json=JSON.parse(bytes.toString('utf8',start,start+length));}
    else if(type===0x004e4942)bin=bytes.subarray(start,start+length);
    offset=start+length;
  }
  if(!json)throw new Error('缺少 JSON 块');
  return {json,bin};
}

function rolesOf(json){
  const roles=new Set((json.nodes??[]).map(node=>node.extras?.gardenRole).filter(role=>typeof role==='string'));
  for(const node of json.nodes??[])for(const role of node.extras?.sourceRoles??[])if(typeof role==='string')roles.add(role);
  return roles;
}
function componentsOf(json){
  const names=new Set();
  for(const node of json.nodes??[])if(node.mesh!==undefined){
    if(node.name)names.add(node.name);
    for(const name of node.extras?.sourceComponents??[])if(typeof name==='string')names.add(name);
  }
  return names;
}
function rememberTexture(bytes,source){
  const hash=createHash('sha256').update(bytes).digest('hex');
  const entry=uniqueTextures.get(hash)??{bytes:bytes.length,references:0,sources:new Set()};
  entry.references++;entry.sources.add(source);uniqueTextures.set(hash,entry);
}

function triangleCount(json,requireCompression=false){
  let triangles=0;
  for(const mesh of json.meshes??[])for(const primitive of mesh.primitives){
    const position=json.accessors?.[primitive.attributes?.POSITION];
    const indices=json.accessors?.[primitive.indices];
    if(!position||(primitive.mode??4)!==4)throw new Error('缺少顶点或非三角网格');
    const count=indices?.count??position.count;
    if(!Number.isInteger(count)||count%3)throw new Error('三角索引数量非法');
    triangles+=count/3;
    const draco=primitive.extensions?.KHR_draco_mesh_compression;
    const meshopt=Object.values(primitive.attributes).some(index=>json.bufferViews?.[json.accessors[index]?.bufferView]?.extensions?.EXT_meshopt_compression);
    if(requireCompression&&!draco&&!meshopt)throw new Error('存在未压缩网格');
  }
  return triangles;
}

function decodedGeometry(document,bakeTransforms=false){
  let triangles=0,degenerateTriangles=0;
  const roleTriangles={},degenerateByRole={},validRoles=new Set(),validComponents=new Set();
  for(const node of document.getRoot().listNodes()){
    const mesh=node.getMesh();if(!mesh)continue;
    const role=String(node.getExtras().gardenRole??'architecture');
    const matrix=bakeTransforms?node.getWorldMatrix():null;
    let valid=0;
    for(const primitive of mesh.listPrimitives()){
      if(primitive.getMode()!==4)throw new Error('解码网格不是三角形');
      const source=primitive.getAttribute('POSITION').getArray();
      let positions=source;
      if(matrix){
        // The optimizer bakes into Float32 POSITION accessors. Audit that same
        // scene coordinate frame independently, without deleting any face here.
        positions=new Float32Array(source.length);
        for(let i=0;i<source.length;i+=3){
          const x=source[i],y=source[i+1],z=source[i+2];
          const w=matrix[3]*x+matrix[7]*y+matrix[11]*z+matrix[15]||1;
          positions[i]=(matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12])/w;
          positions[i+1]=(matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13])/w;
          positions[i+2]=(matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14])/w;
        }
      }
      const indices=primitive.getIndices()?.getArray(),count=indices?.length??positions.length/3;
      if(count%3||!Number.isInteger(count))throw new Error('解码三角数量非法');
      for(let i=0;i<count;i+=3){
        const ia=indices?indices[i]:i,ib=indices?indices[i+1]:i+1,ic=indices?indices[i+2]:i+2;
        const vertices=positions.length/3;
        if(!Number.isInteger(ia)||!Number.isInteger(ib)||!Number.isInteger(ic)||ia<0||ib<0||ic<0||ia>=vertices||ib>=vertices||ic>=vertices)throw new Error('解码索引越界');
        const a=ia*3,b=ib*3,c=ic*3;
        const abx=positions[b]-positions[a],aby=positions[b+1]-positions[a+1],abz=positions[b+2]-positions[a+2];
        const acx=positions[c]-positions[a],acy=positions[c+1]-positions[a+1],acz=positions[c+2]-positions[a+2];
        const crossX=aby*acz-abz*acy,crossY=abz*acx-abx*acz,crossZ=abx*acy-aby*acx;
        if(!Number.isFinite(crossX)||!Number.isFinite(crossY)||!Number.isFinite(crossZ))throw new Error('解码位置或变换含非法值');
        triangles++;roleTriangles[role]=(roleTriangles[role]??0)+1;
        // Exact zero only. Small nonzero leaves, strokes and chamfers remain valid.
        if(crossX===0&&crossY===0&&crossZ===0){degenerateTriangles++;degenerateByRole[role]=(degenerateByRole[role]??0)+1;}
        else valid++;
      }
    }
    if(valid){validRoles.add(role);if(node.getName())validComponents.add(node.getName());}
  }
  return {triangles,degenerateTriangles,roleTriangles,degenerateByRole,validRoles,validComponents};
}

const countIsValid=value=>Number.isInteger(value)&&value>=0;
const equalCounts=(a,b)=>a&&b&&[...new Set([...Object.keys(a),...Object.keys(b)])].every(key=>(a[key]??0)===(b[key]??0));

if(manifest.landmarks.length!==plan.landmarks.length)failures.push('规划与导出院落数量不一致');
if(new Set(manifest.landmarks.map(item=>item.id)).size!==manifest.landmarks.length)failures.push('建筑 ID 重复');
if(manifest.terrain.heights.length!==manifest.terrain.size**2||!manifest.terrain.heights.every(Number.isFinite))failures.push('地形采样不完整或非法');
const chunks=manifest.worldChunks??[];
if(!chunks.length)failures.push('缺少世界植被分区');
if(new Set(chunks.map(chunk=>chunk.id)).size!==chunks.length)failures.push('世界分区 ID 重复');
for(const chunk of chunks){
  if(!Array.isArray(chunk.bounds)||chunk.bounds.length!==2||chunk.bounds.some(point=>!Array.isArray(point)||point.length!==3||!point.every(Number.isFinite))||chunk.bounds[0].some((value,axis)=>value>chunk.bounds[1][axis]))failures.push(chunk.id+' 分区包围盒非法');
  if(!Number.isInteger(chunk.bytes)||chunk.bytes<=0||!Number.isFinite(chunk.triangles)||chunk.triangles<=0)failures.push(chunk.id+' 分区统计非法');
}
const urls=[manifest.worldUrl,...manifest.landmarks.flatMap(item=>[item.url,item.lodUrl]),...chunks.map(chunk=>chunk.url)];
if(new Set(urls).size!==urls.length)failures.push('清单中 GLB URL 重复');
for(const url of new Set(urls)){
  const name=String(url).split('/').at(-1);
  try{
    const file=publicPath(url);
    if(!inside(realPublic,await realpath(file)))throw new Error('GLB 实际文件越出 public');
    const bytes=await readFile(file),{json,bin}=parseGLB(bytes);
    const triangles=triangleCount(json,true);
    if(!json.meshes?.length||!triangles)throw new Error('为空模型');
    for(const material of json.materials??[]){
      const p=material.pbrMetallicRoughness??{};
      if([p.roughnessFactor??1,p.metallicFactor??1,...(p.baseColorFactor??[])].some(value=>!Number.isFinite(value)||value<0||value>1))throw new Error('PBR 材质参数越界');
    }
    for(const accessor of json.accessors??[])if([...(accessor.min??[]),...(accessor.max??[])].some(value=>!Number.isFinite(value)))throw new Error('有非法包围盒');
    for(const node of json.nodes??[])if([...(node.matrix??[]),...(node.translation??[]),...(node.rotation??[]),...(node.scale??[])].some(value=>!Number.isFinite(value)))throw new Error('节点变换非法');
    for(const buffer of json.buffers??[])if(buffer.uri)await relativeResource(file,buffer.uri);
    for(const image of json.images??[]){
      if(image.uri){
        const textureFile=await relativeResource(file,image.uri);
        let texture=externalTextures.get(textureFile);
        if(!texture){texture=await readFile(textureFile);externalTextures.set(textureFile,texture);}
        rememberTexture(texture,path.relative(publicRoot,textureFile).replaceAll(path.sep,'/'));
        externalImageReferences++;
      }else{
        const view=json.bufferViews?.[image.bufferView],offset=view?.byteOffset??0;
        if(!bin||!view||offset<0||offset+view.byteLength>bin.length)throw new Error('内嵌图片范围非法');
        rememberTexture(bin.subarray(offset,offset+view.byteLength),name+'#image'+image.bufferView);
        embeddedImages++;
      }
    }
    // Decode actual compressed buffers; valid declared bounds alone are insufficient.
    const document=await io.read(file);
    for(const accessor of document.getRoot().listAccessors()){
      const values=accessor.getArray();
      if(!values)throw new Error('属性未能解码');
      for(let i=0;i<values.length;i++)if(!Number.isFinite(values[i]))throw new Error('解码属性含非有限值');
      finiteValues+=values.length;
    }
    const decoded=decodedGeometry(document);
    if(decoded.triangles!==triangles)throw new Error('JSON 声明 '+triangles+' 个三角，实际解码 '+decoded.triangles+' 个，压缩计数不一致');
    const sourceCounts={trianglesBefore:0,removedDegenerateTriangles:0};
    for(const node of json.nodes??[])if(node.mesh!==undefined){
      const extras=node.extras??{};
      if(!countIsValid(extras.sourceTriangleCount)||!countIsValid(extras.removedDegenerateTriangles))throw new Error('构件缺少源三角与退化清理计数');
      sourceCounts.trianglesBefore+=extras.sourceTriangleCount;
      sourceCounts.removedDegenerateTriangles+=extras.removedDegenerateTriangles;
    }
    fileSourceCounts.set(url,sourceCounts);
    const roles=rolesOf(json);fileRoles.set(url,roles);fileComponents.set(url,componentsOf(json));
    const chunk=chunks.find(item=>item.url===url);
    if(chunk&&(chunk.bytes!==bytes.length||chunk.triangles!==triangles))throw new Error('分区统计未同步实际文件');
    files.push({name,url,bytes:bytes.length,triangles,decodedTriangles:decoded.triangles,decodedDegenerateTriangles:decoded.degenerateTriangles,meshes:json.meshes.length,roles:[...roles].sort()});
  }catch(error){failures.push(name+'：'+error.message);}
}

for(const spec of manifest.landmarks){
  try{native.push({id:spec.id,bytes:(await stat(path.join(root,'art/landmarks',spec.id+'.blend'))).size});}
  catch{failures.push(spec.id+' 原生集合库缺失');}
  if(!spec.chapter||!spec.evidence?.length||!spec.views)failures.push(spec.id+' 缺少来源或相机');
  for(const view of ['courtyard','interior','look','interiorLook'])if(spec.views?.[view]?.length!==3||!spec.views[view].every(Number.isFinite))failures.push(spec.id+' 相机 '+view+' 不完整');
  const planned=plan.landmarks.find(item=>item.id===spec.id);
  for(const [view,position] of Object.entries(planned?.viewOverrides??{}))if(JSON.stringify(spec.views[view])!==JSON.stringify(position))failures.push(spec.id+' 相机未同步规划');
  const high=fileRoles.get(spec.url),lod=fileRoles.get(spec.lodUrl);
  for(const role of ['roof_shell','roof_tiles','eave_ends','lattice','inscription'])if(high?.has(role)&&!lod?.has(role))failures.push(spec.id+' 基础 LOD 丢失 '+role);
  const highFile=files.find(file=>file.url===spec.url);
  if(highFile&&spec.bytes!==highFile.bytes)failures.push(spec.id+' 清单字节数未同步');
}

// Compare only the raw exports explicitly attributed to this build, never a directory scan.
try{
  const receipt=JSON.parse(await readFile(path.join(root,'tmp/raw-models/build-receipt.json'),'utf8'));
  const optimized=JSON.parse(await readFile(path.join(root,'output/qa/asset-optimization.json'),'utf8'));
  for(const chunk of chunks){
    const entry=optimized.files?.find(file=>file.url===chunk.url);
    if(!entry)continue; // A landmark-only rebuild retains the preceding world output.
    const counts=fileSourceCounts.get(chunk.url);
    if(!counts||!countIsValid(entry.trianglesBefore)||!countIsValid(entry.removedDegenerateTriangles)||entry.trianglesBefore!==counts.trianglesBefore||entry.removedDegenerateTriangles!==counts.removedDegenerateTriangles||entry.trianglesBefore-entry.removedDegenerateTriangles!==chunk.triangles)failures.push(chunk.id+' 分区源有效三角与清理计数不守恒');
  }
  if(receipt.buildId!==manifest.assetBuild?.id)failures.push('资产清单与本次原始导出身份不一致');
  else for(const name of receipt.files){
    if(path.basename(name)!==name||!name.endsWith('.glb')){failures.push('导出回执文件名非法');continue;}
    const sourcePath=path.join(root,'tmp/raw-models',name);
    const {json}=parseGLB(await readFile(sourcePath));
    const source=decodedGeometry(await io.read(sourcePath),true);
    const entry=optimized.files?.find(file=>file.name===name);
    if(!entry||entry.sourceAccessorTriangles!==triangleCount(json)||entry.trianglesBefore!==source.triangles||!countIsValid(entry.removedDegenerateTriangles)||entry.removedDegenerateTriangles!==source.degenerateTriangles||!equalCounts(entry.removedSourceRoleTriangles,source.degenerateByRole)||!equalCounts(entry.sourceRoleTriangles,source.roleTriangles)){
      failures.push(name+' 原始解码、角色分项或严格退化清理计数未完整记录');
      continue;
    }
    sourceChecks.push({name,accessorTriangles:entry.sourceAccessorTriangles,decodedTriangles:source.triangles,
      removedDegenerateTriangles:source.degenerateTriangles,validTriangles:source.triangles-source.degenerateTriangles});
    const required=source.validRoles;
    const actual=name==='garden.glb'?new Set([...(fileRoles.get(manifest.worldUrl)??[]),...chunks.flatMap(chunk=>[...(fileRoles.get(chunk.url)??[])])]):fileRoles.get(entry.url);
    const missingRoles=[...required].filter(role=>!actual?.has(role));
    if(missingRoles.length)failures.push(name+' 优化后丢失构件角色：'+missingRoles.join(', '));
    const components=name==='garden.glb'?new Set([...(fileComponents.get(manifest.worldUrl)??[]),...chunks.flatMap(chunk=>[...(fileComponents.get(chunk.url)??[])])]):fileComponents.get(entry.url);
    const missingComponents=[...source.validComponents].filter(component=>!components?.has(component));
    if(missingComponents.length)failures.push(name+' 优化后丢失 '+missingComponents.length+' 个源构件，例如：'+missingComponents.slice(0,5).join(', '));
    const sourceTriangles=source.triangles,published=files.find(file=>file.url===entry.url);
    if(name!=='garden.glb'){
      if(published?.triangles!==sourceTriangles-entry.removedDegenerateTriangles)failures.push(name+' 离线合批丢失了非退化三角');
    }else{
      const near=files.filter(file=>chunks.some(chunk=>chunk.url===file.url)).reduce((sum,file)=>sum+file.triangles,0);
      const removedNear=Object.entries(source.degenerateByRole).filter(([role])=>VEGETATION_ROLES.has(role)).reduce((sum,[,count])=>sum+count,0);
      const removedStatic=source.degenerateTriangles-removedNear;
      if(['staticTriangles','nearVegetationTriangles','farVegetationTriangles'].some(key=>!countIsValid(entry[key])))failures.push('世界分项三角计数非法');
      if(entry.removedNearVegetationDegenerateTriangles!==removedNear||entry.removedStaticDegenerateTriangles!==removedStatic||entry.removedDegenerateTriangles!==removedNear+removedStatic)failures.push('世界静态与近区退化清理分项不完整');
      if(entry.staticTriangles+entry.nearVegetationTriangles+removedStatic+removedNear!==sourceTriangles||near!==entry.nearVegetationTriangles||published?.triangles!==entry.staticTriangles+entry.farVegetationTriangles)failures.push('世界静态构件或近区植被未完整保留');
      if(!countIsValid(entry.removedFarVegetationDegenerateTriangles)||!countIsValid(entry.farVegetationTrianglesBeforeCleanup)||entry.farVegetationTrianglesBeforeCleanup-entry.removedFarVegetationDegenerateTriangles!==entry.farVegetationTriangles)failures.push('远区简化后的退化清理计数不守恒');
    }
  }
}catch(error){failures.push('原始导出回执：'+error.message);}
if(manifest.assetBuild?.scope==='full'){
  if(manifest.assetBuild.worldBuildId!==manifest.assetBuild.id||manifest.landmarks.some(item=>manifest.assetBuild.landmarkBuildIds?.[item.id]!==manifest.assetBuild.id))failures.push('完整构建混入旧资产身份');
}
if(manifest.circulation?.routes.length!==plan.circulation.routes.length)failures.push('桥路清单未同步场景规划');
if(manifest.surfaces.some(surface=>surface.kind==='quad'&&(surface.vertices.length!==4||surface.vertices.flat().some(value=>!Number.isFinite(value)))))failures.push('桥路行走面包含非法顶点');
const report={passed:failures.length===0,landmarks:manifest.landmarks.length,glbs:files.length,worldChunks:chunks.length,nativeLibraries:native.length,
  nativeMasterBytes:(await stat(path.join(root,'art/scenes/daguanyuan.blend'))).size,buildingTriangles:manifest.landmarks.reduce((sum,item)=>sum+item.triangles,0),
  colliders:manifest.colliders.length,walkSurfaces:manifest.surfaces.length,totalGLBBytes:files.reduce((sum,file)=>sum+file.bytes,0),
  uniqueTextures:uniqueTextures.size,uniqueTextureBytes:[...uniqueTextures.values()].reduce((sum,item)=>sum+item.bytes,0),externalTextureFiles:externalTextures.size,
  externalImageReferences,embeddedImages,finiteValues,removedDegenerateTriangles:sourceChecks.reduce((sum,item)=>sum+item.removedDegenerateTriangles,0),sourceChecks,failures,files};
await writeFile(path.join(root,'output/qa/assets.json'),JSON.stringify(report,null,2),'utf8');
console.log(JSON.stringify({...report,files:undefined,sourceChecks:undefined,failureCount:failures.length,failures:failures.slice(0,24)}));
if(failures.length)process.exitCode=1;
