import * as THREE from'three';

export const APRON_MAX_RISE=16;
export function landscapeVariant(role:string):'terrain'|'surroundings'|'foliage'|'none'{
 return role==='terrain'?'terrain':role==='surroundings'?'surroundings':['grove_foliage','tree_leaves','evergreen','grass','groundcover'].includes(role)?'foliage':'none';
}
/** Displacement is restricted to the non-walkable apron. BatchedMesh copies
 * source bounds at insertion, so extend them before batching. */
export function extendApronBounds(geometry:THREE.BufferGeometry){
 if(!geometry.boundingBox)geometry.computeBoundingBox();
 geometry.boundingBox!.max.y+=APRON_MAX_RISE;
 geometry.boundingBox!.getBoundingSphere(geometry.boundingSphere??=new THREE.Sphere());
}
const noise=`
 float gardenLandscapeHash(vec2 p){p=fract(p*vec2(123.34,345.45));p+=dot(p,p+34.345);return fract(p.x*p.y);}
 float gardenLandscapeNoise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(gardenLandscapeHash(i),gardenLandscapeHash(i+vec2(1.0,0.0)),f.x),mix(gardenLandscapeHash(i+vec2(0.0,1.0)),gardenLandscapeHash(i+vec2(1.0,1.0)),f.x),f.y);
 }
 float gardenOutside(vec2 p){vec2 d=max(max(uGardenLandscapeBounds.xy-p,p-uGardenLandscapeBounds.xy-uGardenLandscapeBounds.zw),vec2(0.0));return max(d.x,d.y);}
`;

/** One material hook for continuous terrain, foliage colour and the far apron.
 * Colour/normal/roughness share the UV perturbation. It adds no texture fetch. */
export function styleLandscapeShader(shader:{uniforms:Record<string,unknown>;vertexShader:string;fragmentShader:string},role:string,bounds:THREE.Vector4,field:THREE.Texture){
 const variant=landscapeVariant(role),ground=variant==='terrain',apron=variant==='surroundings',foliage=variant==='foliage';
 if(!ground&&!apron&&!foliage)return;
 const vertexHooks=apron?['#include <beginnormal_vertex>','#include <begin_vertex>']:[];
 if(ground||apron)vertexHooks.push('#include <project_vertex>');
 for(const hook of vertexHooks)if(!shader.vertexShader.includes(hook))throw new Error('园景材质的顶点接口缺失：'+hook);
 if(!shader.fragmentShader.includes('#include <roughnessmap_fragment>')||!shader.fragmentShader.includes('gardenSnow')||!shader.fragmentShader.includes('vGardenPosition'))throw new Error('园景材质的表面接口需重新核对');
 if(apron&&!shader.fragmentShader.includes('#include <fog_fragment>'))throw new Error('园外地表的远景接口需重新核对');
 shader.uniforms.uGardenLandscapeBounds={value:bounds};
 shader.uniforms.uGardenLandscapeField={value:field};
 const height=`float gardenApronHeight(vec2 p){return smoothstep(8.0,140.0,gardenOutside(p))*(5.0+${(APRON_MAX_RISE-5).toFixed(1)}*gardenLandscapeNoise(p*.011+vec2(7.0,13.0)));}`;
 shader.vertexShader='uniform vec4 uGardenLandscapeBounds;\n'+noise+(apron?height:'')+shader.vertexShader;
 if(apron){
  shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
   float gardenDx=gardenApronHeight(position.xz+vec2(.5,0.0))-gardenApronHeight(position.xz-vec2(.5,0.0));
   float gardenDz=gardenApronHeight(position.xz+vec2(0.0,.5))-gardenApronHeight(position.xz-vec2(0.0,.5));
   objectNormal=normalize(objectNormal+vec3(-gardenDx,0.0,-gardenDz));`);
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.y+=gardenApronHeight(position.xz);');
 }
 if(ground||apron){
  // vGardenPosition is filled by GardenEnvironment's world-position hook.
  shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`
   vec2 gardenWarp=.11*vec2(gardenLandscapeNoise(position.xz*.075+vec2(11.0,4.0))-.5,gardenLandscapeNoise(position.xz*.075+vec2(3.0,27.0))-.5);
   #ifdef USE_MAP
    vMapUv+=gardenWarp;
   #endif
   #ifdef USE_NORMALMAP
    vNormalMapUv+=gardenWarp;
   #endif
   #ifdef USE_ROUGHNESSMAP
    vRoughnessMapUv+=gardenWarp;
   #endif
   #include <project_vertex>`);
 }
 shader.fragmentShader='uniform vec4 uGardenLandscapeBounds; uniform sampler2D uGardenLandscapeField;\n'+noise+shader.fragmentShader;
 const colour=apron?`
  float gardenFar=smoothstep(8.0,200.0,gardenOutside(vGardenPosition.xz));
  vec3 gardenSage=mix(vec3(.115,.165,.075),vec3(.19,.235,.13),gardenPatch);
  float gardenApronLuma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
  diffuseColor.rgb=mix(diffuseColor.rgb,gardenApronLuma*vec3(.74,1.12,.58),.65*(1.0-gardenSnow));
  diffuseColor.rgb=mix(diffuseColor.rgb,gardenSage,gardenFar*.94*(1.0-gardenSnow));`
  :ground?`
  vec3 gardenUse=texture2D(uGardenLandscapeField,clamp((vGardenPosition.xz-uGardenLandscapeBounds.xy)/uGardenLandscapeBounds.zw,vec2(0.0),vec2(1.0))).rgb;
  float gardenGrowth=gardenUse.r*smoothstep(.20,.73,gardenPatch);
  float gardenLuma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
  vec3 gardenMoss=gardenLuma*mix(vec3(.68,1.15,.44),vec3(.79,1.23,.58),gardenPatch);
  diffuseColor.rgb=mix(diffuseColor.rgb,gardenMoss,gardenGrowth*.87*(1.0-gardenSnow));
  diffuseColor.rgb*=mix(vec3(1.0),vec3(1.05,1.03,.94),gardenUse.g*(1.0-gardenSnow));`
  :`diffuseColor.rgb*=mix(mix(vec3(.86,.92,.77),vec3(1.02,1.02,.94),gardenPatch),vec3(1.0),gardenSnow);`;
 // Run after snow/wet colour is resolved, preserving the white of snow.
 shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`
  float gardenPatch=.68*gardenLandscapeNoise(vGardenPosition.xz*.13)+.32*gardenLandscapeNoise(vGardenPosition.xz*.41+vec2(9.0,17.0));
  ${colour}
  #include <roughnessmap_fragment>`);
 if(apron)shader.fragmentShader=shader.fragmentShader.replace('#include <fog_fragment>',`#include <fog_fragment>
  #ifdef USE_FOG
   // Fade only the non-walkable apron into the same atmospheric horizon.
   // Walking-distance architecture and terrain keep their clear depth range.
   float gardenHorizonFade=smoothstep(140.0,340.0,gardenOutside(vGardenPosition.xz));
   gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,gardenHorizonFade);
  #endif`);
}
