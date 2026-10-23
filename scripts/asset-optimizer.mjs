import {createHash} from 'node:crypto';
import {Document, Format, PropertyType} from '@gltf-transform/core';
import {compactPrimitive, copyToDocument, dedup, draco, joinPrimitives, prune, transformPrimitive, unpartition, weldPrimitive} from '@gltf-transform/functions';

export const VEGETATION_ROLES=new Set(['foliage','tree_leaves','grove_foliage','leaf_litter','tree_structure','evergreen','banana_leaves','banana_stem','bamboo_stem','herbs','herb_stems','reeds','groundcover','grass','grass_flower','blossom','lotus_flower','lotus','climbing_vines','climbers','vegetables']);
export const DISTINCT_ROLES=new Set([...VEGETATION_ROLES,'cut_flower','flower_stems','lantern_glow','water','mirror','roof_shell','inscription','terrain','surroundings']);
export const PIPELINE_VERSION=1;

export function normalizedRole(role){return DISTINCT_ROLES.has(role)?role:'architecture';}
export function tileFor(x,z,size=32){return `x${Math.floor(x/size)}_z${Math.floor(z/size)}`;}
export function triangleCount(primitive){return (primitive.getIndices()?.getCount()??primitive.getAttribute('POSITION').getCount())/3;}

export function boundsOf(primitive){
  const p=primitive.getAttribute('POSITION').getArray();
  const bounds=[[Infinity,Infinity,Infinity],[-Infinity,-Infinity,-Infinity]];
  const indices=primitive.getIndices()?.getArray();
  for(let j=0,count=indices?.length??p.length/3;j<count;j++){
    const i=indices?indices[j]:j;
    for(let axis=0;axis<3;axis++){const value=p[i*3+axis];if(!Number.isFinite(value))throw new Error('Non-finite vertex');bounds[0][axis]=Math.min(bounds[0][axis],value);bounds[1][axis]=Math.max(bounds[1][axis],value);}
  }
  return bounds;
}

export function combineBounds(bounds){
  const result=[[Infinity,Infinity,Infinity],[-Infinity,-Infinity,-Infinity]];
  for(const bound of bounds)for(let i=0;i<3;i++){result[0][i]=Math.min(result[0][i],bound[0][i]);result[1][i]=Math.max(result[1][i],bound[1][i]);}
  return result;
}

function independentPrimitive(document,source,matrix){
  if(source.getMode()!==4||source.listTargets().length)throw new Error('Only static triangle primitives are supported');
  const primitive=document.createPrimitive().setMaterial(source.getMaterial()).setMode(4);
  for(const semantic of source.listSemantics()){
    const old=source.getAttribute(semantic);
    if(!['POSITION','NORMAL','TEXCOORD_0','COLOR_0'].includes(semantic))throw new Error(`Unexpected vertex attribute: ${semantic}`);
    primitive.setAttribute(semantic,old.clone().setArray(old.getArray().slice()));
  }
  const old=source.getIndices();
  primitive.setIndices(old?old.clone().setArray(old.getArray().slice()):document.createAccessor().setType('SCALAR').setArray(Uint32Array.from({length:primitive.getAttribute('POSITION').getCount()},(_,i)=>i)));
  transformPrimitive(primitive,matrix);
  return primitive;
}

export function removeDegenerateTriangles(primitive){
  const positions=primitive.getAttribute('POSITION').getArray(),indices=primitive.getIndices().getArray(),kept=[];
  let removed=0;
  for(let i=0;i<indices.length;i+=3){
    const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
    const abx=positions[b]-positions[a],aby=positions[b+1]-positions[a+1],abz=positions[b+2]-positions[a+2];
    const acx=positions[c]-positions[a],acy=positions[c+1]-positions[a+1],acz=positions[c+2]-positions[a+2];
    // Strict equality only: tiny but nonzero calligraphy/leaf triangles remain intact.
    if(aby*acz-abz*acy===0&&abz*acx-abx*acz===0&&abx*acy-aby*acx===0)removed++;
    else kept.push(indices[i],indices[i+1],indices[i+2]);
  }
  if(removed)primitive.setIndices(primitive.getIndices().clone().setArray(new Uint32Array(kept)));
  return removed;
}

/** Whole triangles cross tile borders unchanged; their true bounds remain conservative. */
export function splitPrimitiveByTile(document,primitive,size=32){
  const p=primitive.getAttribute('POSITION').getArray(),indices=primitive.getIndices().getArray();
  const tiles=new Map();
  for(let i=0;i<indices.length;i+=3){
    const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
    const id=tileFor((p[a]+p[b]+p[c])/3,(p[a+2]+p[b+2]+p[c+2])/3,size);
    const list=tiles.get(id)??[];list.push(indices[i],indices[i+1],indices[i+2]);tiles.set(id,list);
  }
  return [...tiles].map(([id,indices])=>{
    const piece=document.createPrimitive().setMaterial(primitive.getMaterial()).setMode(4);
    for(const semantic of primitive.listSemantics())piece.setAttribute(semantic,primitive.getAttribute(semantic));
    piece.setIndices(document.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)));
    return {id,primitive:piece};
  });
}

/** Bake transforms and batch once at build time, preserving the runtime's semantic boundaries. */
export async function prepareDocument(document,{id,world=false,tileSize=32}={}){
  const root=document.getRoot();
  if(root.listAnimations().length||root.listSkins().length)throw new Error('Animated/skinned input requires an explicit optimizer policy');
  await document.transform(dedup({propertyTypes:[PropertyType.MATERIAL]}));
  const materialIds=new Map(root.listMaterials().map((material,index)=>[material,index]));
  const nodes=[...root.listNodes()],oldMeshes=[...root.listMeshes()];
  const groups=new Map(),sourceRoleTriangles={},removedSourceRoleTriangles={};let beforeTriangles=0,beforeVertices=0,meshesBefore=0,removedDegenerateTriangles=0,removedStaticDegenerateTriangles=0,removedNearVegetationDegenerateTriangles=0;
  for(const node of nodes){
    const mesh=node.getMesh();if(!mesh)continue;
    const extras=node.getExtras(),sourceRole=String(extras.gardenRole??'architecture'),role=normalizedRole(sourceRole);
    const matrix=node.getWorldMatrix();
    for(const source of mesh.listPrimitives()){
      meshesBefore++;beforeTriangles+=triangleCount(source);beforeVertices+=source.getAttribute('POSITION').getCount();
      sourceRoleTriangles[sourceRole]=(sourceRoleTriangles[sourceRole]??0)+triangleCount(source);
      const primitive=independentPrimitive(document,source,matrix);
      // Material identity is insufficient when only some terrain surfaces have vertex colours.
      const layout=primitive.listSemantics().sort().map(semantic=>{
        const accessor=primitive.getAttribute(semantic);
        return `${semantic}:${accessor.getType()}:${accessor.getComponentType()}:${accessor.getNormalized()}`;
      }).join('|');
      const pieces=world&&!['water','surroundings'].includes(role)?splitPrimitiveByTile(document,primitive,tileSize):[{id:'global',primitive}];
      for(const piece of pieces){
        const key=`${piece.id}|${role}|${materialIds.get(primitive.getMaterial())}|${layout}`;
        const group=groups.get(key)??{tile:piece.id,role,primitives:[],components:new Set(),sourceRoles:new Set(),inscriptions:[],sourceTriangleCount:0,removedDegenerateTriangles:0};
        group.sourceTriangleCount+=triangleCount(piece.primitive);
        const removed=removeDegenerateTriangles(piece.primitive);group.removedDegenerateTriangles+=removed;removedDegenerateTriangles+=removed;
        if(removed)removedSourceRoleTriangles[sourceRole]=(removedSourceRoleTriangles[sourceRole]??0)+removed;
        if(VEGETATION_ROLES.has(role))removedNearVegetationDegenerateTriangles+=removed;else removedStaticDegenerateTriangles+=removed;
        if(triangleCount(piece.primitive)>0)group.primitives.push(piece.primitive);
        group.components.add(node.getName());group.sourceRoles.add(sourceRole);
        if(extras.inscriptionText)group.inscriptions.push({name:node.getName(),text:extras.inscriptionText});
        groups.set(key,group);
      }
    }
  }
  for(const node of nodes)node.dispose();
  for(const mesh of oldMeshes)mesh.dispose();
  const scene=root.listScenes()[0]??document.createScene(id);root.setDefaultScene(scene);
  for(const extra of root.listScenes().slice(1))extra.dispose();
  for(const group of groups.values()){
    if(!group.primitives.length)continue;
    const primitive=joinPrimitives(group.primitives);weldPrimitive(primitive,{overwrite:true});
    const extras={gardenRole:group.role,landmarkId:id,bounds:boundsOf(primitive),tileKey:group.tile,
      sourceComponents:[...group.components],sourceRoles:[...group.sourceRoles],sourceTriangleCount:group.sourceTriangleCount,
      removedDegenerateTriangles:group.removedDegenerateTriangles,optimized:PIPELINE_VERSION};
    if(group.inscriptions.length)extras.inscriptions=group.inscriptions;
    if(world&&VEGETATION_ROLES.has(group.role)){extras.detailTile=group.tile;extras.detailLevel='near';}
    const material=primitive.getMaterial()?.getName()??'material';
    const name=`${id}.${group.tile}.${group.role}.${material}`;
    scene.addChild(document.createNode(name).setMesh(document.createMesh(name).addPrimitive(primitive)).setExtras(extras));
  }
  await document.transform(prune({keepAttributes:true,keepSolidTextures:true,keepExtras:false}),unpartition());
  const after=statistics(document);
  if(after.triangles+removedDegenerateTriangles!==beforeTriangles)throw new Error(`Batching changed non-degenerate triangles: ${id}`);
  return {trianglesBefore:beforeTriangles,verticesBefore:beforeVertices,meshesBefore,sourceRoleTriangles,removedDegenerateTriangles,removedSourceRoleTriangles,
    removedStaticDegenerateTriangles,removedNearVegetationDegenerateTriangles,...after};
}

export function statistics(document){
  let triangles=0,vertices=0,meshes=0;const roleTriangles={};
  for(const node of document.getRoot().listNodes()){
    const mesh=node.getMesh();if(!mesh)continue;
    const role=node.getExtras().gardenRole??'architecture';
    for(const p of mesh.listPrimitives()){const count=triangleCount(p);triangles+=count;vertices+=p.getAttribute('POSITION').getCount();meshes++;roleTriangles[role]=(roleTriangles[role]??0)+count;}
  }
  return {triangles,vertices,meshes,roleTriangles};
}

export function documentWithNodes(source,nodes,name){
  const target=new Document().setLogger(source.getLogger());
  for(const extension of source.getRoot().listExtensionsUsed())target.createExtension(extension.constructor).setRequired(extension.isRequired());
  const copied=copyToDocument(target,source,nodes),scene=target.createScene(name);target.getRoot().setDefaultScene(scene);
  for(const node of nodes)scene.addChild(copied.get(node));
  return target;
}

/** Thin complete, disconnected laminae rather than collapsing them to needles.
 * Only the far document is changed. Retained leaves grow slightly around their
 * centre, with a measured displacement cap; no solid canopy is introduced. */
export function thinWholeLeaves(primitive,ratio=.4,maxDisplacement=.06){
  const old=primitive.getAttribute('POSITION'),positions=old.getArray(),indices=primitive.getIndices().getArray();
  const parent=Int32Array.from({length:old.getCount()},(_,i)=>i);
  function find(i){while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;}
  for(let i=0;i<indices.length;i+=3){const root=find(indices[i]);parent[find(indices[i+1])]=root;parent[find(indices[i+2])]=root;}
  const groups=new Map();
  for(const i of indices){const root=find(i),group=groups.get(root)??new Set();group.add(i);groups.set(root,group);}
  const leaves=[...groups],keep=new Set(),next=positions.slice();let moved=0;
  for(let j=0;j<leaves.length;j++){
    // Stratified by component order, so neither one material nor one branch
    // gets all the retained leaves. Guarantee a nonempty tiny border tile.
    if(Math.floor((j+1)*ratio)===Math.floor(j*ratio)&&!(leaves.length*ratio<1&&j===0))continue;
    const [root,vertices]=leaves[j];keep.add(root);const center=[0,0,0];
    for(const i of vertices)for(let a=0;a<3;a++)center[a]+=positions[i*3+a]/vertices.size;
    let radius=0;for(const i of vertices)radius=Math.max(radius,Math.hypot(...center.map((c,a)=>positions[i*3+a]-c)));
    const scale=1+Math.min(.5,1/Math.sqrt(ratio)-1,maxDisplacement/Math.max(radius,1e-9));
    for(const i of vertices)for(let a=0;a<3;a++)next[i*3+a]=center[a]+(positions[i*3+a]-center[a])*scale;
    moved=Math.max(moved,radius*(scale-1));
  }
  const kept=[];for(let i=0;i<indices.length;i+=3)if(keep.has(find(indices[i])))kept.push(indices[i],indices[i+1],indices[i+2]);
  primitive.setAttribute('POSITION',old.clone().setArray(next));
  primitive.setIndices(primitive.getIndices().clone().setArray(new Uint32Array(kept)));compactPrimitive(primitive);
  return {leavesBefore:leaves.length,leavesAfter:keep.size,maxDisplacement:moved};
}

/** Far-only simplification; grove foliage uses a whole-leaf coverage policy. */
export async function simplifyFarVegetation(document,simplifier,{ratio=.22,errorMeters=.06}={}){
  await simplifier.ready;const results=[];
  for(const node of document.getRoot().listNodes()){
    const extras=node.getExtras();if(!extras.detailTile)continue;
    let oldCount=0,newCount=0,maxError=0,removedDegenerateTriangles=0;
    for(const primitive of node.getMesh().listPrimitives()){
      const before=triangleCount(primitive);oldCount+=before;
      if(extras.gardenRole==='grove_foliage'){
        thinWholeLeaves(primitive,Math.max(.4,ratio),errorMeters);
        newCount+=triangleCount(primitive);continue;
      }
      const position=primitive.getAttribute('POSITION').getArray();
      const normal=primitive.getAttribute('NORMAL')?.getArray(),uv=primitive.getAttribute('TEXCOORD_0')?.getArray();
      const stride=(normal?3:0)+(uv?2:0),attributes=new Float32Array(position.length/3*stride),weights=[];
      if(normal)weights.push(.05,.05,.05);if(uv)weights.push(.025,.025);
      for(let i=0;i<position.length/3;i++){let a=i*stride;if(normal)for(let k=0;k<3;k++)attributes[a++]=normal[i*3+k];if(uv)for(let k=0;k<2;k++)attributes[a++]=uv[i*2+k];}
      const indices=Uint32Array.from(primitive.getIndices().getArray()),target=Math.max(3,Math.floor(indices.length*ratio/3)*3);
      const [simplified,error]=simplifier.simplifyWithAttributes(indices,position,3,attributes,stride,weights,null,target,errorMeters,['ErrorAbsolute','PreserveFolds']);
      // A tile/semantic surface must not disappear, even if its thin disconnected leaves resist reduction.
      if(simplified.length>=3){primitive.setIndices(primitive.getIndices().clone().setArray(simplified));compactPrimitive(primitive);maxError=Math.max(maxError,error);}
      removedDegenerateTriangles+=removeDegenerateTriangles(primitive);
      newCount+=triangleCount(primitive);
    }
    node.setExtras({...extras,detailLevel:'far',bounds:combineBounds(node.getMesh().listPrimitives().map(boundsOf))});
    results.push({tile:extras.detailTile,role:extras.gardenRole,before:oldCount,after:newCount,errorMeters:maxError,removedDegenerateTriangles,
      strategy:extras.gardenRole==='grove_foliage'?'whole-leaf-coverage':'meshopt'});
  }
  return results;
}

export function packGlb(json,binary){
  const text=Buffer.from(JSON.stringify(json),'utf8'),jsonLength=Math.ceil(text.length/4)*4,binLength=Math.ceil(binary.length/4)*4;
  const result=Buffer.alloc(12+8+jsonLength+8+binLength);result.writeUInt32LE(0x46546c67,0);result.writeUInt32LE(2,4);result.writeUInt32LE(result.length,8);
  result.writeUInt32LE(jsonLength,12);result.writeUInt32LE(0x4e4f534a,16);result.fill(0x20,20,20+jsonLength);text.copy(result,20);
  result.writeUInt32LE(binLength,20+jsonLength);result.writeUInt32LE(0x004e4942,24+jsonLength);Buffer.from(binary).copy(result,28+jsonLength);
  return result;
}

/** External resources contain the original encoded bytes, never a texture re-encode. */
export async function serializeSharedGlb(io,document,{texturePrefix='textures/',precision={position:16,normal:12,texcoord:14},volume='mesh'}={}){
  await document.transform(prune({keepAttributes:true,keepSolidTextures:true,keepExtras:false}),unpartition(),
    draco({method:'edgebreaker',encodeSpeed:5,decodeSpeed:5,quantizePosition:precision.position,quantizeNormal:precision.normal,quantizeTexcoord:precision.texcoord,quantizeColor:12,quantizeGeneric:16,quantizationVolume:volume}));
  const data=await io.writeJSON(document,{format:Format.GLTF});const json=data.json;
  if(json.buffers?.length!==1)throw new Error('Expected one geometry buffer after unpartition');
  const binary=data.resources[json.buffers[0].uri];if(!binary)throw new Error('Missing geometry resource');
  delete json.buffers[0].uri;json.buffers[0].byteLength=binary.length;
  const textures=[],imageKeys=[];
  for(const image of json.images??[]){
    const bytes=data.resources[image.uri];if(!bytes)throw new Error(`Missing image bytes: ${image.uri}`);
    const hash=createHash('sha256').update(bytes).digest('hex');
    const extension=image.uri.split('.').at(-1)?.toLowerCase();
    const mime=image.mimeType??document.getRoot().listTextures().find(t=>t.getURI()===image.uri)?.getMimeType()??
      ({webp:'image/webp',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',ktx2:'image/ktx2',avif:'image/avif'}[extension]);
    const ext={'image/webp':'webp','image/png':'png','image/jpeg':'jpg','image/ktx2':'ktx2','image/avif':'avif'}[mime];
    if(!ext)throw new Error(`Unsupported image MIME: ${mime}`);
    const filename=`${hash}.${ext}`;image.uri=texturePrefix+filename;image.mimeType=mime;image.extras={...image.extras,sharedTextureKey:hash};
    textures.push({hash,filename,mimeType:mime,bytes});imageKeys.push(hash);
  }
  for(const texture of json.textures??[]){const image=texture.source??texture.extensions?.EXT_texture_webp?.source??texture.extensions?.KHR_texture_basisu?.source??texture.extensions?.EXT_texture_avif?.source;if(image!==undefined)texture.extras={...texture.extras,sharedTextureKey:imageKeys[image]};}
  json.asset.extras={...json.asset.extras,gardenOptimized:PIPELINE_VERSION,coordinates:'gltf-y-up',transformsBaked:true,precision,volume};
  return {bytes:packGlb(json,binary),textures,json};
}
