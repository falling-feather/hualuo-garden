import * as THREE from 'three';
import type {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

export function materialResourceKey(material:THREE.MeshStandardMaterial) {
  const clearcoat=material instanceof THREE.MeshPhysicalMaterial?material.clearcoatNormalScale.toArray():[];
  return JSON.stringify([material.userData.gardenSharedId??material.uuid,material.type,material.normalScale.toArray(),clearcoat,material.vertexColors,material.flatShading]);
}

/** One decoded image and material definition per external resource across GLB parsers. */
export function shareGLTFResources(loader:GLTFLoader) {
  const textures=new Map<string,Promise<THREE.Texture>>();
  const materials=new Map<string,Promise<THREE.Material>>();
  let materialId=0;
  loader.register(parser=>{
    const textureKey=(index:number)=>{
      const definition=parser.json.textures[index];
      const source=definition.extensions?.EXT_texture_webp?.source??definition.source;
      const image=parser.json.images[source];
      // Embedded textures are scoped to their parser. The build pipeline externalizes all production images.
      return image.uri?new URL(image.uri,new URL(parser.options.path,location.href)).href+'|'+JSON.stringify(parser.json.samplers?.[definition.sampler]??{}):null;
    };
    const loadImage=parser.loadTextureImage.bind(parser);
    parser.loadTextureImage=(index,source,handler)=>{
      const key=textureKey(index);
      if(!key)return loadImage(index,source,handler);
      let promise=textures.get(key);
      if(!promise){promise=loadImage(index,source,handler);textures.set(key,promise);promise.catch(()=>textures.delete(key));}
      return promise;
    };
    return {
      name:'GARDEN_shared_resources',
      loadMaterial(index:number){
        const definition=parser.json.materials[index];
        let external=true;
        const normalized=JSON.parse(JSON.stringify(definition,(key,value)=>{
          if(key.endsWith('Texture')&&value&&typeof value.index==='number'){
            const texture=textureKey(value.index);
            if(!texture)external=false;
            return {...value,index:texture};
          }
          return value;
        }));
        if(!external)return parser.loadMaterial(index);
        const key=JSON.stringify(normalized);
        let promise=materials.get(key);
        if(!promise){
          const id=++materialId;
          promise=parser.loadMaterial(index).then(material=>{material.userData.gardenSharedId=id;return material;});
          materials.set(key,promise);promise.catch(()=>materials.delete(key));
        }
        return promise;
      },
    };
  });
  return {get textures(){return textures.size;},get materials(){return materials.size;}};
}
