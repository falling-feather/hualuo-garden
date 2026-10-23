import{NodeIO}from'@gltf-transform/core';import{ALL_EXTENSIONS}from'@gltf-transform/extensions';import draco3d from'draco3d';
import*as THREE from'three';import{readFile,writeFile}from'node:fs/promises';
import{refineRepresentativeCrown,REPRESENTATIVE_GROVE}from'../src/scene/foliage-study.ts';
const manifest=JSON.parse(await readFile('public/garden.manifest.json','utf8')),io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco3d.createDecoderModule()}),[x,y]=REPRESENTATIVE_GROVE.anchor,z=-y,r=REPRESENTATIVE_GROVE.radius+.4;
const urls=[manifest.worldUrl,...manifest.worldChunks.filter(c=>c.bounds[0][0]<x+r&&c.bounds[1][0]>x-r&&c.bounds[0][2]<z+r&&c.bounds[1][2]>z-r).map(c=>c.url)],sources=[];
for(const url of urls){
 const doc=await io.read('public'+url);let leaves=0,maxDisplacement=0,triangles=0,bytes=0;
 for(const node of doc.getRoot().listNodes()){
  if(node.getExtras().gardenRole!=='grove_foliage'||!node.getMesh())continue;
  for(const primitive of node.getMesh().listPrimitives()){
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(primitive.getAttribute('POSITION').getArray(),3));geometry.setAttribute('uv',new THREE.BufferAttribute(primitive.getAttribute('TEXCOORD_0').getArray(),2));geometry.setIndex(new THREE.BufferAttribute(primitive.getIndices().getArray(),1));
   const count=geometry.index.count,bufferBytes=geometry.getAttribute('position').array.byteLength+geometry.getAttribute('uv').array.byteLength+geometry.index.array.byteLength,result=refineRepresentativeCrown(geometry);
   if(count!==geometry.index.count||bufferBytes!==geometry.getAttribute('position').array.byteLength+geometry.getAttribute('uv').array.byteLength+geometry.index.array.byteLength)throw new Error('样机增加了几何预算');
   leaves+=result.leaves;maxDisplacement=Math.max(maxDisplacement,result.maxDisplacement);triangles+=count/3;bytes+=bufferBytes;geometry.dispose();
  }
 }
 sources.push({url,leaves,maxDisplacement,triangles,bytes});
}
const passed=sources[0].leaves>0&&sources.slice(1).some(s=>s.leaves>0)&&sources.every(s=>s.maxDisplacement<=REPRESENTATIVE_GROVE.maxDisplacement+1e-8);
const report={passed,scope:'CPU读取实际当前远近GLB；仅改写内存中的完整叶片，磁盘模型不变；不是实机视觉证明。',study:REPRESENTATIVE_GROVE,sources};
await writeFile('output/qa/crown-study-cpu-20261023.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(!passed)process.exitCode=1;
