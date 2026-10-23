import test from'node:test';import assert from'node:assert/strict';import * as THREE from'three';
import{GardenEnvironment}from'../src/scene/environment.ts';
import{styleLandscapeShader}from'../src/scene/landscape-style.ts';
test('园景变体与当前Three.js正式材质接口连接，独立角色不误用同一程序',()=>{
 const environment=new GardenEnvironment(new THREE.Scene(),[-96,-80,90,100]),keys=new Set();
 for(const role of ['terrain','surroundings','grove_foliage']){
  const material=new THREE.MeshStandardMaterial();environment.prepareMaterial(material,role);
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  assert.doesNotThrow(()=>material.onBeforeCompile(shader as never,{} as THREE.WebGLRenderer));
  assert.deepEqual(shader.uniforms.uGardenLandscapeBounds.value.toArray(),[-96,-100,186,180]);keys.add(material.customProgramCacheKey());material.dispose();
 }
 assert.equal(keys.size,3);
 const leaf=new THREE.MeshStandardMaterial(),evergreen=new THREE.MeshStandardMaterial();environment.prepareMaterial(leaf,'tree_leaves');environment.prepareMaterial(evergreen,'evergreen');
 assert.equal(leaf.customProgramCacheKey(),evergreen.customProgramCacheKey(),'代码一致的叶材质不因名称不同重复编译');leaf.dispose();evergreen.dispose();
});
test('材质接口变更会明确报错，不让局部注入静默失效',()=>{
 const shader={uniforms:{},vertexShader:'void main(){}',fragmentShader:'void main(){}'},before=shader.vertexShader;
 assert.throws(()=>styleLandscapeShader(shader,'surroundings',new THREE.Vector4(),new THREE.Texture()),/接口/);assert.equal(shader.vertexShader,before);
});
