import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GLTFLoader,type GLTFParser,type GLTFLoaderPlugin} from 'three/addons/loaders/GLTFLoader.js';
import {shareGLTFResources,materialResourceKey} from '../src/scene/shared-gltf.ts';

test('跨模型与分区只解码一次相同外贴图，相同材质参数只构造一次',async()=>{
  Object.defineProperty(globalThis,'location',{value:new URL('http://127.0.0.1:5416/'),configurable:true});
  let factory:(parser:GLTFParser)=>GLTFLoaderPlugin;
  const loader={register(callback:typeof factory){factory=callback;return this;}} as GLTFLoader;
  const resources=shareGLTFResources(loader);
  let imageCalls=0,materialCalls=0;
  const parser=(path:string,uri:string,index:number,roughness=.8)=>({
    options:{path},
    json:{images:[{uri}],textures:Array.from({length:index+1},()=>({extensions:{EXT_texture_webp:{source:0}},sampler:0})),samplers:[{minFilter:9987}],
      materials:[{name:'stone',pbrMetallicRoughness:{roughnessFactor:roughness,baseColorTexture:{index}}}]},
    async loadTextureImage(){imageCalls++;return new THREE.Texture();},
    async loadMaterial(){materialCalls++;return new THREE.MeshStandardMaterial({roughness});},
  }) as unknown as GLTFParser;
  const a=parser('/models/','textures/a.webp',0),b=parser('/models/garden-tiles/','../textures/a.webp',3);
  const pa=factory!(a),pb=factory!(b);
  const [ta,tb]=await Promise.all([a.loadTextureImage(0,0,{} as never),b.loadTextureImage(3,0,{} as never)]);
  const [ma,mb]=await Promise.all([pa.loadMaterial!(0),pb.loadMaterial!(0)]);
  assert.equal(ta,tb);assert.equal(ma,mb);assert.equal(imageCalls,1);assert.equal(materialCalls,1);
  // GLTFLoader clones a final material per parser when geometry lacks tangents.
  const finalA=(ma as THREE.MeshStandardMaterial).clone(),finalB=(mb as THREE.MeshStandardMaterial).clone();
  finalA.normalScale.y*=-1;finalB.normalScale.y*=-1;
  assert.notEqual(finalA.uuid,finalB.uuid);
  assert.equal(materialResourceKey(finalA),materialResourceKey(finalB));
  assert.notEqual(materialResourceKey(finalA),materialResourceKey(ma as THREE.MeshStandardMaterial));
  const c=parser('/models/','textures/a.webp',0,.35),pc=factory!(c);
  assert.notEqual(await pc.loadMaterial!(0),ma,'同名但不同PBR参数不得误共用');
  assert.equal(resources.textures,1);assert.equal(resources.materials,2);
  delete (globalThis as {location?:unknown}).location;
});

function triangleGLB(tangents:boolean):ArrayBuffer {
  const values=[0,0,0,1,0,0,0,1,0, 0,0,1,0,0,1,0,0,1, 0,0,1,0,0,1];
  if(tangents)values.push(1,0,0,1,1,0,0,1,1,0,0,1);
  const binary=new Uint8Array(new Float32Array(values).buffer);
  const attributes:Record<string,number>={POSITION:0,NORMAL:1,TEXCOORD_0:2};
  const bufferViews=[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:36},{buffer:0,byteOffset:72,byteLength:24}];
  const accessors=[
    {bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]},
    {bufferView:1,componentType:5126,count:3,type:'VEC3'},
    {bufferView:2,componentType:5126,count:3,type:'VEC2'},
  ];
  if(tangents){
    attributes.TANGENT=3;
    bufferViews.push({buffer:0,byteOffset:96,byteLength:48});
    accessors.push({bufferView:3,componentType:5126,count:3,type:'VEC4'});
  }
  const source={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],
    meshes:[{primitives:[{attributes,material:0}]}],
    materials:[{name:'shared-stone',pbrMetallicRoughness:{roughnessFactor:.8}}],
    buffers:[{byteLength:binary.byteLength}],bufferViews,accessors};
  const json=new TextEncoder().encode(JSON.stringify(source)),jsonLength=Math.ceil(json.length/4)*4;
  const result=new ArrayBuffer(12+8+jsonLength+8+binary.byteLength),view=new DataView(result);
  view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,result.byteLength,true);
  view.setUint32(12,jsonLength,true);view.setUint32(16,0x4e4f534a,true);
  new Uint8Array(result,20,jsonLength).fill(32);new Uint8Array(result,20,json.length).set(json);
  const binOffset=20+jsonLength;
  view.setUint32(binOffset,binary.byteLength,true);view.setUint32(binOffset+4,0x004e4942,true);
  new Uint8Array(result,binOffset+8,binary.byteLength).set(binary);
  return result;
}

test('真实 GLTFLoader 最终材质跨 parser 合批，同时区分切线与导数切线变体',async()=>{
  const loader=new GLTFLoader(),resources=shareGLTFResources(loader);
  const results=await Promise.all([
    loader.parseAsync(triangleGLB(false),'/models/'),
    loader.parseAsync(triangleGLB(false),'/models/'),
    loader.parseAsync(triangleGLB(true),'/models/'),
  ]);
  const meshes=results.map(result=>{
    const object=result.scene.children[0];
    assert.ok(object instanceof THREE.Mesh);
    assert.ok(object.material instanceof THREE.MeshStandardMaterial);
    return object as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
  });
  const [a,b,withTangents]=meshes;
  assert.equal(a.geometry.getAttribute('tangent'),undefined);
  assert.ok(withTangents.geometry.getAttribute('tangent'));
  assert.notEqual(a.material.uuid,b.material.uuid,'真实 loader 会在各 parser 中创建最终材质 clone');
  assert.equal(materialResourceKey(a.material),materialResourceKey(b.material),'相同最终材质必须具有稳定合批身份');
  assert.notEqual(materialResourceKey(a.material),materialResourceKey(withTangents.material),'不能合并不同法线切线约定');
  assert.deepEqual(a.material.normalScale.toArray(),[1,-1]);
  assert.deepEqual(withTangents.material.normalScale.toArray(),[1,1]);
  assert.equal(resources.materials,1,'三个模型仍只需要一份基础材质定义');
  for(const mesh of meshes)mesh.geometry.dispose();
});
