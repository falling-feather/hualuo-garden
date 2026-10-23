import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import type { Landmark, Manifest, WorldChunk } from '../domain/types.ts';
import type { GardenEnvironment } from './environment.ts';
import type { StateSnapshot } from '../domain/state.ts';
import {selectDetailedLandmarks} from '../domain/detail-budget.ts';
import {shareGLTFResources,materialResourceKey} from './shared-gltf.ts';
import {dynamicMaterialRole} from '../domain/material-roles.ts';
import {extendApronBounds}from'./landscape-style.ts';
import{groveOffset}from'../domain/landscape.ts';
import{refineRepresentativeCrown}from'./foliage-study.ts';

const identity=new THREE.Matrix4();
const breathe=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
interface AssetPair {spec:Landmark;lod:THREE.Group;bounds:THREE.Box3;high?:THREE.Group;used:number;bytes:number}
interface BatchEntry {batch:THREE.BatchedMesh;instance:number;id:string;role:string;tile?:string;visible:boolean}
interface Tile {spec:WorldChunk;bounds:THREE.Box3;group?:THREE.Group;used:number;bytes:number}

function geometryBytes(group:THREE.Group) {
  let bytes=0;
  group.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    for(const attribute of Object.values(object.geometry.attributes) as THREE.BufferAttribute[])bytes+=attribute.array.byteLength;
    bytes+=object.geometry.index?.array.byteLength??0;
  });
  return bytes;
}

export class GardenAssets {
  readonly group=new THREE.Group();
  readonly pairs=new Map<string,AssetPair>();
  world:THREE.Group|null=null;
  #loader:GLTFLoader;
  #decoder:DRACOLoader;
  #shared:ReturnType<typeof shareGLTFResources>;
  #environment:GardenEnvironment;
  #materials=new Map<string,THREE.MeshStandardMaterial>();
  #pending=new Map<string,Promise<void>>();
  #failed=new Set<string>();
  #counter=0;
  #baseEntries:BatchEntry[]=[];
  #worldEntries:BatchEntry[]=[];
  #pickBatches:THREE.BatchedMesh[]=[];
  #tiles=new Map<string,Tile>();
  #wanted=new Set<string>();
  #wantedTiles=new Set<string>();
  #state:StateSnapshot|null=null;
  #specs=new Map<string,Landmark>();
  #sheltered=new Set<string>();
  #frustum=new THREE.Frustum();
  #projection=new THREE.Matrix4();
  #lastDecision=0;
  #baseReady=false;
  loaded=0;
  error:string|null=null;
  onDetail:((id:string,ready:boolean)=>void)|null=null;
  onChange:(()=>void)|null=null;
  onError:((error:Error)=>void)|null=null;
  prepareGPU:((group:THREE.Group)=>Promise<void>)|null=null;

  constructor(environment:GardenEnvironment,readonly terrainHeight:(x:number,y:number)=>number) {
    this.#environment=environment;
    this.#decoder=new DRACOLoader().setDecoderPath('/draco/').setWorkerLimit(2);
    this.#loader=new GLTFLoader().setDRACOLoader(this.#decoder);
    this.#shared=shareGLTFResources(this.#loader);
    this.group.name='大观园';
  }

  async #prepare(source:THREE.Group,id:string) {
    source.updateMatrixWorld(true);
    const meshes:THREE.Mesh[]=[];
    source.traverse(object=>{if(object instanceof THREE.Mesh)meshes.push(object);});
    const group=new THREE.Group();
    group.name=id;group.userData.landmarkId=id;
    const captureRoof=!this.#sheltered.has(id);
    let capturedRoof=false;
    let count=0;
    for(const object of meshes) {
      if(Array.isArray(object.material)||!(object.material instanceof THREE.MeshStandardMaterial))throw new Error('模型材质结构不符：'+object.name);
      const original=object.material;
      const sourceRole=String(object.userData.gardenRole??'architecture');
      const role=dynamicMaterialRole(sourceRole);
      const key=materialResourceKey(original)+'|'+role+(role==='blossom'?'|'+id:'');
      let material=this.#materials.get(key);
      if(!material) {
        material=original.clone();
        if(role==='water'&&material instanceof THREE.MeshPhysicalMaterial){material.transmission=0;material.thickness=0;}
        for(const value of Object.values(material))if(value instanceof THREE.Texture)value.anisotropy=8;
        if(role==='blossom')material.side=THREE.DoubleSide;
        this.#environment.prepareMaterial(material,role);
        this.#materials.set(key,material);
      }
      // The build bakes transforms and joins compatible geometry. No clone/merge allocation here.
      if(!object.matrixWorld.equals(identity))object.geometry.applyMatrix4(object.matrixWorld);
      if(id==='garden'&&sourceRole==='grove_foliage')refineRepresentativeCrown(object.geometry);
      if(id==='garden'&&['tree_structure','grove_foliage','tree_leaves','evergreen'].includes(sourceRole)){
        const positions=object.geometry.getAttribute('position');
        for(let i=0;i<positions.count;i++){
          const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i),height=y-this.terrainHeight(x,-z),offset=groveOffset(x,z,height);
          positions.setXYZ(i,x+offset[0],y+offset[1],z+offset[2]);
        }
        positions.needsUpdate=true;object.geometry.computeVertexNormals();object.geometry.computeBoundingBox();object.geometry.computeBoundingSphere();
      }
      if(sourceRole==='roof_shell'&&captureRoof) {
        const spec=this.#specs.get(id),placement=new THREE.Matrix4();
        if(spec){placement.makeRotationY(spec.rotation);placement.setPosition(spec.position[0],spec.position[2],-spec.position[1]);}
        this.#environment.addRoof(object.geometry,placement);
        capturedRoof=true;
      }
      if(!object.geometry.attributes.normal)object.geometry.computeVertexNormals();
      if(!object.geometry.attributes.uv)object.geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(object.geometry.attributes.position!.count*2),2));
      for(const name of Object.keys(object.geometry.attributes))if(!['position','normal','uv','color'].includes(name))object.geometry.deleteAttribute(name);
      // GLTFLoader already derives conservative bounds from the accessors. Reusing
      // them avoids scanning every vertex again when a large courtyard arrives.
      if(!object.geometry.boundingBox)object.geometry.computeBoundingBox();
      if(!object.geometry.boundingSphere)object.geometry.boundingBox!.getBoundingSphere(object.geometry.boundingSphere=new THREE.Sphere());
      if(sourceRole==='surroundings')extendApronBounds(object.geometry);
      object.removeFromParent();
      object.position.set(0,0,0);object.quaternion.identity();object.scale.set(1,1,1);object.updateMatrix();
      object.material=material;
      object.userData={...object.userData,landmarkId:id,gardenRole:role};
      object.castShadow=!['water','groundcover','grass','grass_flower','leaf_litter','surroundings'].includes(sourceRole);
      object.receiveShadow=sourceRole!=='surroundings';
      group.add(object);
      if(++count%12===0)await breathe();
    }
    // Base assets retain the complete roof shell, so higher detail adds no new shelter geometry.
    if(capturedRoof)this.#sheltered.add(id);
    return group;
  }

  #place(group:THREE.Group,spec:Landmark) {
    group.position.set(spec.position[0],spec.position[2],-spec.position[1]);
    group.rotation.y=spec.rotation;
    group.updateMatrix();
  }

  async load(manifest:Manifest,onProgress:(done:number,total:number)=>void) {
    this.#specs=new Map(manifest.landmarks.map(spec=>[spec.id,spec]));
    for(const spec of manifest.worldChunks)this.#tiles.set(spec.id,{spec,bounds:new THREE.Box3(new THREE.Vector3(...spec.bounds[0]),new THREE.Vector3(...spec.bounds[1])),used:0,bytes:0});
    const total=manifest.landmarks.length+1;
    const world=await this.#loader.loadAsync(manifest.worldUrl);
    this.world=await this.#prepare(world.scene,'garden');
    this.group.add(this.world);
    await this.#batch([this.world],this.world,this.#worldEntries,false);
    onProgress(++this.loaded,total);
    const queue=[...manifest.landmarks];
    const worker=async()=>{
      while(queue.length) {
        const spec=queue.shift()!;
        const gltf=await this.#loader.loadAsync(spec.lodUrl);
        const lod=await this.#prepare(gltf.scene,spec.id);
        this.#place(lod,spec);
        this.group.add(lod);
        const bounds=new THREE.Box3().setFromObject(lod);
        this.pairs.set(spec.id,{spec,lod,bounds,used:++this.#counter,bytes:0});
        onProgress(++this.loaded,total);
        await breathe();
      }
    };
    await Promise.all([worker(),worker()]);
    await this.#batch([...this.pairs.values()].map(pair=>pair.lod),this.group,this.#baseEntries,true);
    this.#baseReady=true;
    if(this.#state)this.applyState(this.#state);
  }

  async #batch(groups:THREE.Group[],destination:THREE.Group,records:BatchEntry[],pickable:boolean) {
    const buckets=new Map<string,{material:THREE.Material;items:Array<{mesh:THREE.Mesh;matrix:THREE.Matrix4}>}>();
    for(const group of groups) {
      group.updateMatrixWorld(true);
      group.traverse(object=>{
        if(!(object instanceof THREE.Mesh)||object.userData.gardenRole==='water')return;
        const material=object.material as THREE.Material;
        const key=material.uuid+'|'+object.castShadow+'|'+object.receiveShadow;
        const bucket=buckets.get(key)??{material,items:[]};
        bucket.items.push({mesh:object,matrix:object.matrixWorld.clone()});
        buckets.set(key,bucket);
      });
    }
    for(const {material,items} of buckets.values()) {
      const vertices=items.reduce((n,item)=>n+item.mesh.geometry.attributes.position!.count,0);
      const indices=items.reduce((n,item)=>n+(item.mesh.geometry.index?.count??item.mesh.geometry.attributes.position!.count),0);
      const batch=new THREE.BatchedMesh(items.length,vertices,indices,material);
      batch.name='园景 · '+material.name;
      batch.castShadow=items[0]!.mesh.castShadow;batch.receiveShadow=items[0]!.mesh.receiveShadow;
      batch.perObjectFrustumCulled=true;
      batch.sortObjects=false;
      batch.userData.landmarkByInstance={};
      for(const item of items) {
        const geometry=batch.addGeometry(item.mesh.geometry),instance=batch.addInstance(geometry);
        batch.setMatrixAt(instance,item.matrix);
        const id=String(item.mesh.userData.landmarkId),role=String(item.mesh.userData.gardenRole);
        records.push({batch,instance,id,role,tile:item.mesh.userData.detailTile,visible:true});
        batch.userData.landmarkByInstance[instance]=id;
        item.mesh.removeFromParent();
        item.mesh.geometry.dispose();
      }
      batch.computeBoundingSphere();
      destination.add(batch);
      if(pickable)this.#pickBatches.push(batch);
      // The source meshes are discarded; only batch buffers and small visibility records survive.
      await breathe();
    }
  }

  async requestDetail(id:string) {
    const pair=this.pairs.get(id);
    if(!pair)throw new RangeError('未找到院落模型：'+id);
    pair.used=++this.#counter;
    if(pair.high)return;
    if(this.#pending.has(id))return this.#pending.get(id);
    this.onDetail?.(id,false);
    const promise=(async()=>{
      try {
        const gltf=await this.#loader.loadAsync(pair.spec.url);
        const high=await this.#prepare(gltf.scene,id);
        this.#place(high,pair.spec);
        await this.prepareGPU?.(high);
        high.visible=false;
        pair.high=high;pair.bytes=geometryBytes(high);
        this.group.add(high);
        this.#failed.delete(id);
        if(this.#state)this.applyState(this.#state);
        this.onDetail?.(id,true);this.onChange?.();
        this.#trim();
      } catch(error) {
        this.#failed.add(id);
        this.error='院落细节载入失败：'+id;
        throw error;
      } finally {this.#pending.delete(id);}
    })();
    this.#pending.set(id,promise);
    return promise;
  }

  async #requestTile(tile:Tile) {
    const key='tile:'+tile.spec.id;
    if(tile.group||this.#pending.has(key)||this.#failed.has(key))return;
    const promise=(async()=>{
      try {
        const gltf=await this.#loader.loadAsync(tile.spec.url);
        const group=await this.#prepare(gltf.scene,'garden');
        await this.prepareGPU?.(group);
        tile.group=group;tile.bytes=geometryBytes(group);tile.used=++this.#counter;
        group.visible=false;
        this.group.add(group);
        if(this.#state)this.applyState(this.#state);
        this.onChange?.();this.#trim();
      } catch(error) {
        this.#failed.add(key);this.error='园景细节载入失败：'+tile.spec.id;
        throw error;
      } finally {this.#pending.delete(key);}
    })();
    this.#pending.set(key,promise);
    return promise;
  }

  #release(group:THREE.Group) {
    this.group.remove(group);
    group.traverse(object=>{if(object instanceof THREE.Mesh)object.geometry.dispose();});
    group.clear();
  }

  #trim() {
    const highs=[...this.pairs.values()].filter(pair=>pair.high).sort((a,b)=>a.used-b.used);
    let bytes=highs.reduce((n,pair)=>n+pair.bytes,0),count=highs.length;
    for(const pair of highs) {
      if(count<=3&&bytes<=96*1048576)break;
      if(this.#wanted.has(pair.spec.id)||this.#pending.has(pair.spec.id))continue;
      this.#release(pair.high!);pair.high=undefined;bytes-=pair.bytes;pair.bytes=0;count--;
    }
    const tiles=[...this.#tiles.values()].filter(tile=>tile.group).sort((a,b)=>a.used-b.used);
    bytes=tiles.reduce((n,tile)=>n+tile.bytes,0);count=tiles.length;
    for(const tile of tiles) {
      if(count<=6&&bytes<=48*1048576)break;
      if(this.#wantedTiles.has(tile.spec.id))continue;
      this.#release(tile.group!);tile.group=undefined;bytes-=tile.bytes;tile.bytes=0;count--;
    }
  }

  update(camera:THREE.Camera,active:string|null) {
    if(!this.#baseReady)return;
    const now=performance.now();
    if(now-this.#lastDecision>180) {
      this.#lastDecision=now;
      camera.updateMatrixWorld();
      this.#projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
      this.#frustum.setFromProjectionMatrix(this.#projection);
      this.#wanted=selectDetailedLandmarks([...this.pairs].map(([id,pair])=>({id,distance:pair.bounds.distanceToPoint(camera.position),inView:this.#frustum.intersectsBox(pair.bounds)})),active,this.#wanted);
      for(const id of this.#wanted)this.pairs.get(id)!.used=++this.#counter;
      const tiles=[...this.#tiles.values()].map(tile=>({tile,distance:tile.bounds.distanceToPoint(camera.position)}))
        .filter(({tile,distance})=>distance<(this.#wantedTiles.has(tile.spec.id)?40:30)&&this.#frustum.intersectsBox(tile.bounds)).sort((a,b)=>a.distance-b.distance).slice(0,4);
      this.#wantedTiles=new Set(tiles.map(({tile})=>tile.spec.id));
      for(const {tile} of tiles)tile.used=++this.#counter;
      // One speculative load at a time; an explicitly focused building can still take priority.
      if(this.#pending.size===0) {
        const id=[...this.#wanted].find(id=>!this.pairs.get(id)!.high&&!this.#failed.has(id));
        const tile=tiles.find(({tile})=>!tile.group&&!this.#failed.has('tile:'+tile.spec.id))?.tile;
        const promise=id?this.requestDetail(id):tile?this.#requestTile(tile):null;
        promise?.catch(error=>this.onError?.(error instanceof Error?error:new Error(String(error))));
      }
      this.#trim();
    }
    let changed=false;
    for(const [id,pair] of this.pairs){
      if(pair.high){const visible=this.#wanted.has(id);changed ||= pair.high.visible!==visible;pair.high.visible=visible;}
      // Small courtyard/ well water remains outside the batches and must switch too.
      pair.lod.visible=!pair.high?.visible;
    }
    for(const tile of this.#tiles.values())if(tile.group){const visible=this.#wantedTiles.has(tile.spec.id);changed ||= tile.group.visible!==visible;tile.group.visible=visible;}
    const visibility=(entry:BatchEntry,visible:boolean)=>{
      if(entry.visible===visible)return;
      entry.visible=visible;entry.batch.setVisibleAt(entry.instance,visible);changed=true;
    };
    for(const entry of this.#baseEntries)visibility(entry,!(this.pairs.get(entry.id)?.high?.visible)&&this.#seasonVisible(entry.role,entry.id));
    for(const entry of this.#worldEntries)visibility(entry,!(entry.tile&&this.#tiles.get(entry.tile)?.group?.visible)&&this.#seasonVisible(entry.role,'garden'));
    if(changed)this.onChange?.();
  }

  #seasonVisible(role:string,id:string) {
    const state=this.#state;
    if(!state)return true;
    if(role==='tree_leaves'||role==='grove_foliage'||role==='leaf_litter'||role==='banana_leaves'||role==='grass'||role==='grass_flower')return state.season!=='winter';
    if(role==='lotus'||role==='lotus_flower')return state.season==='summer';
    if(role==='blossom')return (id==='longcui'?(state.season==='winter'||state.season==='spring'):state.season==='spring')&&(state.landmarks[id]?.bloom??1)>.01;
    return true;
  }

  applyState(state:StateSnapshot) {
    this.#state=state;
    const apply=(group:THREE.Group|undefined|null,id:string)=>group?.traverse(object=>{
      if(!(object instanceof THREE.Mesh)||object instanceof THREE.BatchedMesh)return;
      const role=object.userData.gardenRole;
      if(role!=='water')object.visible=this.#seasonVisible(role,id);
      if(role==='blossom') {
        const material=object.material as THREE.MeshStandardMaterial,bloom=state.landmarks[id]?.bloom??1;
        const transparent=bloom<.999;
        if(material.transparent!==transparent){material.transparent=transparent;material.needsUpdate=true;}
        material.opacity=bloom;material.depthWrite=!transparent;
      }
    });
    apply(this.world,'garden');
    for(const [id,pair] of this.pairs)apply(pair.high,id);
    for(const tile of this.#tiles.values())apply(tile.group,'garden');
    for(const entry of this.#baseEntries)if(entry.role==='blossom') {
      const material=entry.batch.material as THREE.MeshStandardMaterial,bloom=state.landmarks[entry.id]?.bloom??1;
      if(material.transparent!==(bloom<.999)){material.transparent=bloom<.999;material.needsUpdate=true;}
      material.opacity=bloom;material.depthWrite=!material.transparent;
    }
  }

  pick(ray:THREE.Raycaster):string|null {
    const objects:THREE.Object3D[]=[...this.#pickBatches];
    for(const pair of this.pairs.values())if(pair.high?.visible)pair.high.traverse(object=>{if(object instanceof THREE.Mesh&&object.visible&&object.userData.gardenRole==='architecture')objects.push(object);});
    const hit=ray.intersectObjects(objects,false)[0];
    if(!hit)return null;
    if(hit.object instanceof THREE.BatchedMesh)return hit.object.userData.landmarkByInstance[hit.batchId!];
    return String(hit.object.userData.landmarkId);
  }

  detailLoaded(id:string){return !!this.pairs.get(id)?.high;}
  get materialCount(){return this.#materials.size;}
  diagnostics(){
    return {sharedTextures:this.#shared.textures,sharedMaterials:this.#shared.materials,
      activeDetail:[...this.#wanted],loadedWorldTiles:[...this.#tiles].filter(([,tile])=>tile.group).map(([id])=>id),
      activeWorldTiles:[...this.#wantedTiles],pending:[...this.#pending.keys()],
      detailGeometryMB:Number(([...this.pairs.values()].reduce((n,pair)=>n+pair.bytes,0)/1048576).toFixed(2)),
      worldDetailGeometryMB:Number(([...this.#tiles.values()].reduce((n,tile)=>n+tile.bytes,0)/1048576).toFixed(2))};
  }
}
