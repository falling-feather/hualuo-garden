import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Water } from 'three/addons/objects/Water.js';
import { GardenAssets } from './assets.ts';
import { GardenEnvironment, createGardenEnvironmentMap } from './environment.ts';
import { GardenCollision } from '../domain/collision.ts';
import { GardenState } from '../domain/state.ts';
import type { ViewMode } from '../domain/state.ts';
import type { Landmark, Manifest, Vec3 } from '../domain/types.ts';
import type {ViewCheckpoint} from '../domain/view.ts';
import {UnsafeViewError} from '../domain/save.ts';
import {withMinimalUploadDraw}from'./gpu-upload.ts';

function worldPoint(local: Vec3, landmark: Landmark) {
  const c=Math.cos(landmark.rotation),s=Math.sin(landmark.rotation);
  return new THREE.Vector3(landmark.position[0]+local[0]*c-local[1]*s,landmark.position[2]+local[2],-(landmark.position[1]+local[0]*s+local[1]*c));
}
type Tween = { from:THREE.Vector3; to:THREE.Vector3; targetFrom:THREE.Vector3; targetTo:THREE.Vector3; start:number; duration:number; complete:()=>void };

export class GardenViewer extends EventTarget {
  readonly scene=new THREE.Scene();
  readonly camera=new THREE.PerspectiveCamera(47,1,.12,1600);
  readonly state:GardenState;
  readonly assets:GardenAssets;
  readonly environment:GardenEnvironment;
  readonly renderer:THREE.WebGLRenderer;
  readonly controls:OrbitControls;
  readonly manifest:Manifest;
  readonly collision:GardenCollision;
  #composer:EffectComposer;
  #ao:GTAOPass;
  #bloom:UnrealBloomPass;
  #water:Water|null=null;
  #canvas:HTMLCanvasElement;
  #tween:Tween|null=null;
  #keys=new Set<string>();
  #walking=false;
  #inputBlocked=false;
  #yaw=0;
  #pitch=0;
  #dragging=false;
  #lastPointer=new THREE.Vector2();
  #lastTime=0;
  #elapsed=0;
  #autoTime=0;
  #shadowTime=0;
  #shadowTarget=new THREE.Vector3(Infinity,Infinity,Infinity);
  #shadowDirection=new THREE.Vector3();
  #shadowSpan=0;
  #reflectionTime=-Infinity;
  #reflectionPosition=new THREE.Vector3(Infinity,Infinity,Infinity);
  #reflectionRotation=new THREE.Quaternion();
  #reflectionDirty=true;
  #frames=0;
  #samples:number[]=[];
  #ready=false;
  #quality:'fine'|'smooth'='fine';
  #lanternLights:THREE.PointLight[]=[];
  #disposed=false;
  #uploadQueue:Promise<void>=Promise.resolve();
  #uploadScene=new THREE.Scene();
  #uploadCamera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);
  #uploadTarget=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false});
  #uploadMaterial=new THREE.MeshBasicMaterial({depthWrite:false,depthTest:false,toneMapped:false});

  constructor(canvas:HTMLCanvasElement,manifest:Manifest) {
    super();
    this.#canvas=canvas;
    this.manifest=manifest;
    this.state=new GardenState(manifest.landmarks.map(item=>item.id));
    this.collision=new GardenCollision(manifest.terrain,manifest.colliders,manifest.surfaces,manifest.water.level);
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'high-performance'});
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.AgXToneMapping;
    this.renderer.toneMappingExposure=1.10;
    this.renderer.shadowMap.enabled=true;
    this.renderer.shadowMap.type=THREE.PCFShadowMap;
    this.renderer.info.autoReset=false;
    this.environment=new GardenEnvironment(this.scene,manifest.bounds);
    this.environment.configureLandscape(manifest);
    this.environment.sun.shadow.autoUpdate=false;
    this.assets=new GardenAssets(this.environment,(x,y)=>this.collision.terrainHeight(x,y));
    this.assets.onChange=()=>{this.environment.sun.shadow.needsUpdate=true;this.#reflectionDirty=true;};
    this.assets.onError=error=>this.dispatchEvent(new CustomEvent('error',{detail:error}));
    this.#uploadCamera.position.z=3;
    this.assets.prepareGPU=group=>{
      this.#uploadQueue=this.#uploadQueue.then(()=>this.#prepareGPU(group));
      return this.#uploadQueue;
    };
    this.scene.add(this.assets.group);
    this.assets.onDetail=(id,ready)=>{
      if(ready)this.environment.sun.shadow.needsUpdate=true;
      this.dispatchEvent(new CustomEvent('detail',{detail:{id,ready}}));
    };
    this.scene.environment=createGardenEnvironmentMap(this.renderer);
    this.camera.position.set(139,116,161);
    this.controls=new OrbitControls(this.camera,canvas);
    this.controls.target.set(0,3,-4);
    this.controls.enableDamping=true;
    this.controls.dampingFactor=.07;
    this.controls.maxPolarAngle=Math.PI*.485;
    this.controls.minDistance=1.1;
    this.controls.maxDistance=330;
    this.controls.enablePan=true;
    this.controls.addEventListener('start',()=>{this.#tween?.complete();this.#tween=null;});
    const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples:4});
    target.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
    this.#composer=new EffectComposer(this.renderer,target);
    this.#composer.addPass(new RenderPass(this.scene,this.camera));
    this.#ao=new GTAOPass(this.scene,this.camera,1,1);
    // Reconstruct normals from the beauty pass depth instead of drawing the garden again.
    this.#ao.setGBuffer(this.#composer.readBuffer.depthTexture!);
    this.#ao.blendIntensity=.24;
    this.#ao.updateGtaoMaterial({radius:.52,thickness:.45,samples:8});
    this.#ao.updatePdMaterial({radius:3,samples:8});
    this.#composer.addPass(this.#ao);
    this.#bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.22,.4,1.2);
    this.#composer.addPass(this.#bloom);
    this.#composer.addPass(new OutputPass());
    this.state.addEventListener('change',event=>{
      this.environment.updateState((event as CustomEvent).detail);
      const snapshot=this.state.snapshot();
      document.documentElement.dataset.weather=snapshot.weather;
      document.documentElement.dataset.hour=snapshot.hour.toFixed(2);
      this.assets.applyState(snapshot);
      this.environment.sun.shadow.needsUpdate=true;
      this.#reflectionDirty=true;
    });
    this.environment.updateState(this.state.snapshot());
    this.#bindInput();
    this.resize();
    window.addEventListener('resize',()=>this.resize());
    canvas.addEventListener('webglcontextlost',event=>{
      event.preventDefault();
      this.dispatchEvent(new CustomEvent('error',{detail:'图形上下文已暂停，请重新载入页面。'}));
    });
    this.renderer.setAnimationLoop(time=>this.#frame(time));
  }
  async load(onProgress:(done:number,total:number)=>void) {
    await this.assets.load(this.manifest,(done,total)=>{
      onProgress(done,total);
      this.environment.sun.shadow.needsUpdate=true;
    });
    this.#addWater();
    this.#addLanternLights();
    this.assets.applyState(this.state.snapshot());
    await this.#compileForComposer(this.scene);
    this.#ready=true;
    this.#frame(performance.now());
    await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    this.#samples=[];
    this.#lastTime=performance.now();
    this.#canvas.dataset.ready='true';
    this.environment.updateState(this.state.snapshot());
    this.dispatchEvent(new Event('ready'));
  }
  async #prepareGPU(group:THREE.Group) {
    // Compile each new material variant asynchronously, then upload geometry in small frame slices.
    await this.#compileForComposer(group);
    const meshes:THREE.Mesh[]=[];
    group.traverse(object=>{if(object instanceof THREE.Mesh)meshes.push(object);});
    let slice=performance.now();
    for(const source of meshes) {
      if(performance.now()-slice>4){await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));slice=performance.now();}
      const mesh=new THREE.Mesh(source.geometry,this.#uploadMaterial);
      mesh.frustumCulled=false;
      this.#uploadScene.add(mesh);
      const target=this.renderer.getRenderTarget();
      try {
        this.renderer.setRenderTarget(this.#uploadTarget);
        withMinimalUploadDraw(source.geometry,()=>this.renderer.render(this.#uploadScene,this.#uploadCamera));
      } finally {
        this.renderer.setRenderTarget(target);
        this.#uploadScene.remove(mesh);
      }
    }
  }
  async #compileForComposer(object:THREE.Object3D) {
    // Offscreen beauty passes use linear HDR. Compiling against the screen would
    // warm an AgX variant that the composer never uses, causing a second blocking compile.
    const previous=this.renderer.getRenderTarget();
    let ready:Promise<THREE.Object3D>;
    try {
      this.renderer.setRenderTarget(this.#composer.readBuffer);
      ready=this.renderer.compileAsync(object,this.camera,this.scene);
    } finally {this.renderer.setRenderTarget(previous);}
    await ready;
  }
  #addWater() {
    const waterMeshes:THREE.Mesh[]=[];
    this.assets.world?.traverse(object=>{
      if(object instanceof THREE.Mesh&&object.userData.gardenRole==='water')waterMeshes.push(object);
    });
    if(waterMeshes.length!==1)throw new Error('园中主水面分组不完整');
    const source=waterMeshes[0]!;
    const geometry=source.geometry.clone();
    geometry.translate(0,-this.manifest.water.level,0);
    geometry.rotateX(Math.PI/2);
    const normals=new THREE.TextureLoader().load('/textures/water-normal.png',texture=>{
      texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
      texture.colorSpace=THREE.NoColorSpace;
    });
    this.#water=new Water(geometry,{
      textureWidth:384,textureHeight:384,waterNormals:normals,
      sunDirection:this.environment.direction.clone(),sunColor:0xffe3b5,
      waterColor:0x36695f,distortionScale:.55,fog:true,
    });
    // Keep the water body's green scattering visible under daylight instead of a broad white diffuse wash.
    this.#water.material.fragmentShader=this.#water.material.fragmentShader.replace('sunColor * diffuseLight * 0.3','sunColor * diffuseLight * 0.10');
    this.#water.rotation.x=-Math.PI/2;
    this.#water.position.y=this.manifest.water.level;
    this.#water.material.uniforms.size!.value=1.2;
    const reflect=this.#water.onBeforeRender.bind(this.#water);
    this.#water.onBeforeRender=(renderer,scene,camera,geometry,material,group)=>{
      if(scene.overrideMaterial)return;
      const interval=this.#quality==='fine'?.12:.24;
      const moved=camera.position.distanceToSquared(this.#reflectionPosition)>.0025||1-Math.abs(camera.quaternion.dot(this.#reflectionRotation))>.00001;
      const elapsed=this.#elapsed-this.#reflectionTime;
      if(elapsed<interval||(!moved&&!this.#reflectionDirty&&elapsed<1.0))return;
      reflect(renderer,scene,camera,geometry,material,group);
      this.#reflectionTime=this.#elapsed;
      this.#reflectionPosition.copy(camera.position);
      this.#reflectionRotation.copy(camera.quaternion);
      this.#reflectionDirty=false;
    };
    source.visible=false;
    this.scene.add(this.#water);
  }
  #addLanternLights() {
    for(let i=0;i<2;i++){
      const light=new THREE.PointLight(0xffc68a,0,11,2);
      this.scene.add(light);
      this.#lanternLights.push(light);
    }
  }
  resize() {
    const width=this.#canvas.clientWidth,height=this.#canvas.clientHeight;
    const ratio=Math.min(window.devicePixelRatio,this.#quality==='fine'?1.5:1);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width,height,false);
    this.#composer.setPixelRatio(ratio);
    this.#composer.setSize(width,height);
    this.#ao.setSize(Math.max(1,Math.floor(width*ratio*.5)),Math.max(1,Math.floor(height*ratio*.5)));
    this.camera.aspect=width/height;
    this.camera.updateProjectionMatrix();
    this.#ao.enabled=this.#quality==='fine';
  }
  setQuality(quality:'fine'|'smooth') {
    this.#quality=quality;
    this.resize();
  }
  async focus(id:string,view:ViewMode='courtyard') {
    const spec=this.manifest.landmarks.find(item=>item.id===id);
    if(!spec)throw new RangeError('未知院落：'+id);
    this.setNavigationMode('orbit');
    this.state.focus(id);
    const to=view==='overview'
      ? worldPoint([spec.size[0]*.95,-spec.size[1]*1.20,Math.max(...spec.size)*.85+4],spec)
      : worldPoint(view==='interior'?spec.views.interior:spec.views.courtyard,spec);
    const target=worldPoint(view==='interior'?spec.views.interiorLook:spec.views.look,spec);
    const arrived=this.#moveCamera(to,target);
    await Promise.all([arrived,this.assets.requestDetail(id)]);
    this.environment.updateState(this.state.snapshot());
    this.environment.sun.shadow.needsUpdate=true;
  }
  overview() {
    this.setNavigationMode('orbit');
    this.state.focus(null);
    return this.#moveCamera(new THREE.Vector3(139,116,161),new THREE.Vector3(0,3,-4),2.0);
  }
  async arrive(id:string,local:Vec3,look:Vec3){
    const spec=this.manifest.landmarks.find(item=>item.id===id);
    if(!spec)throw new RangeError('未知院落：'+id);
    const eye=worldPoint(local,spec),target=worldPoint(look,spec);
    const height=this.collision.groundHeight(eye.x,-eye.z,eye.y-1.65);
    if(this.collision.blocked(eye.x,-eye.z,height))throw new Error('记忆到达点不可通行');
    eye.y=height+1.65;this.setNavigationMode('orbit');this.state.focus(id);
    await Promise.all([this.#moveCamera(eye,target),this.assets.requestDetail(id)]);
    this.setNavigationMode('walk');
  }
  #moveCamera(to:THREE.Vector3,target:THREE.Vector3,duration=1.6) {
    this.#tween?.complete();
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(reduced) {
      this.camera.position.copy(to);
      this.controls.target.copy(target);
      this.camera.lookAt(target);
      this.#tween=null;
      return Promise.resolve();
    }
    return new Promise<void>(complete=>{
      this.#tween={from:this.camera.position.clone(),to,targetFrom:this.controls.target.clone(),targetTo:target,start:this.#elapsed,duration,complete};
    });
  }
  setNavigationMode(mode:'walk'|'orbit') {
    if((mode==='walk')===this.#walking)return;
    this.#walking=mode==='walk';
    this.#tween?.complete();this.#tween=null;
    this.#keys.clear();
    this.controls.enabled=!this.#walking&&!this.#inputBlocked;
    if(this.#walking) {
      const active=this.manifest.landmarks.find(item=>item.id===this.state.snapshot().activeLandmark);
      const direction=this.camera.getWorldDirection(new THREE.Vector3());
      const x=this.camera.position.x,y=-this.camera.position.z,feet=this.camera.position.y-1.65;
      const height=this.collision.groundHeight(x,y,feet);
      const supported=Math.abs(feet-height)<1.2&&!this.collision.blocked(x,y,height);
      if(!supported){
        const eye=active?worldPoint(active.views.courtyard,active):new THREE.Vector3(0,2.16,89);
        this.camera.position.copy(eye);
        if(active)direction.subVectors(worldPoint(active.views.look,active),eye).normalize();else direction.set(0,0,-1);
      }
      const ground=this.collision.groundHeight(this.camera.position.x,-this.camera.position.z,this.camera.position.y-1.65);
      this.camera.position.y=ground+1.65;
      this.#yaw=Math.atan2(-direction.x,-direction.z);
      this.#pitch=Math.asin(direction.y);
      this.camera.quaternion.setFromEuler(new THREE.Euler(this.#pitch,this.#yaw,0,'YXZ'));
    } else {
      const direction=this.camera.getWorldDirection(new THREE.Vector3());
      this.controls.target.copy(this.camera.position).addScaledVector(direction,7);
      this.controls.update();
    }
    document.documentElement.dataset.navigation=mode;
    this.dispatchEvent(new CustomEvent('navigation',{detail:mode}));
  }
  setInputBlocked(blocked:boolean){this.#inputBlocked=blocked;this.#keys.clear();this.#dragging=false;this.controls.enabled=!blocked&&!this.#walking;}
  get navigation(){return this.#walking?'walk':'orbit';}
  get inputBlocked(){return this.#inputBlocked;}
  levelView(){if(this.#walking){this.#pitch=0;this.camera.quaternion.setFromEuler(new THREE.Euler(0,this.#yaw,0,'YXZ'));}}
  viewCheckpoint():ViewCheckpoint{
    const eye=this.camera.position,direction=this.camera.getWorldDirection(new THREE.Vector3());
    return {eye:[eye.x,-eye.z,eye.y],direction:[direction.x,-direction.z,direction.y],mode:this.navigation,landmark:this.state.snapshot().activeLandmark};
  }
  async restoreView(view:ViewCheckpoint){
    this.#tween?.complete();this.#tween=null;
    const [x,y,z]=view.eye;
    if(view.mode==='walk'){
      const ground=this.collision.groundHeight(x,y,z-1.65);
      if(this.collision.blocked(x,y,ground)||Math.abs(z-1.65-ground)>1.2)throw new UnsafeViewError('上次位置暂不可站立');
    }
    this.setNavigationMode('orbit');
    this.state.focus(view.landmark);
    this.camera.position.set(x,z,-y);this.controls.target.copy(this.camera.position).add(new THREE.Vector3(view.direction[0],view.direction[2],-view.direction[1]).multiplyScalar(7));
    this.camera.lookAt(this.controls.target);
    if(view.mode==='walk')this.setNavigationMode('walk');else this.controls.update();
    if(view.landmark)await this.assets.requestDetail(view.landmark);
    this.environment.sun.shadow.needsUpdate=true;
  }
  async frameScene(eye:Vec3,target:Vec3){
    this.setNavigationMode('orbit');
    await this.#moveCamera(new THREE.Vector3(eye[0],eye[2],-eye[1]),new THREE.Vector3(target[0],target[2],-target[1]),.85);
  }
  captureGarden(crop?:Pick<DOMRect,'x'|'y'|'width'|'height'>){
    // Capture the actual garden render, without the DOM controls or a screen grab.
    this.#composer.render(0);
    const image=document.createElement('canvas');image.width=320;image.height=200;
    const ratio=this.#canvas.width/this.#canvas.clientWidth;
    if(crop)image.getContext('2d')!.drawImage(this.#canvas,crop.x*ratio,crop.y*ratio,crop.width*ratio,crop.height*ratio,0,0,image.width,image.height);
    else image.getContext('2d')!.drawImage(this.#canvas,0,0,image.width,image.height);
    return image.toDataURL('image/webp',.72);
  }
  setMoveIntent(direction:'forward'|'backward'|'left'|'right',pressed:boolean){
    const code={forward:'KeyW',backward:'KeyS',left:'KeyA',right:'KeyD'}[direction];
    if(!pressed)this.#keys.delete(code);else if(this.#walking&&!this.#inputBlocked)this.#keys.add(code);
  }
  #bindInput() {
    this.#canvas.addEventListener('dblclick',event=>{
      if(this.#walking)return;
      const rect=this.#canvas.getBoundingClientRect();
      const pointer=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
      const ray=new THREE.Raycaster();
      ray.setFromCamera(pointer,this.camera);
      const id=this.assets.pick(ray);
      if(id)this.focus(id).catch(error=>this.dispatchEvent(new CustomEvent('error',{detail:String(error)})));
    });
    this.#canvas.addEventListener('pointerdown',event=>{
      if(!this.#walking||this.#inputBlocked)return;
      this.#dragging=true;
      this.#lastPointer.set(event.clientX,event.clientY);
      this.#canvas.setPointerCapture(event.pointerId);
    });
    this.#canvas.addEventListener('pointermove',event=>{
      if(!this.#walking||!this.#dragging)return;
      this.#yaw-=(event.clientX-this.#lastPointer.x)*.003;
      this.#pitch=THREE.MathUtils.clamp(this.#pitch-(event.clientY-this.#lastPointer.y)*.003,-1.15,1.15);
      this.#lastPointer.set(event.clientX,event.clientY);
      this.camera.quaternion.setFromEuler(new THREE.Euler(this.#pitch,this.#yaw,0,'YXZ'));
    });
    this.#canvas.addEventListener('pointerup',()=>{this.#dragging=false;});
    for(const type of ['pointercancel','lostpointercapture'])this.#canvas.addEventListener(type,()=>{this.#dragging=false;});
    window.addEventListener('keydown',event=>{
      if(this.#inputBlocked||event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement||event.target instanceof HTMLSelectElement)return;
      if(event.code==='Escape')this.setNavigationMode('orbit');
      if(this.#walking&&['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft'].includes(event.code)){
        event.preventDefault();this.#keys.add(event.code);
      }
    });
    window.addEventListener('keyup',event=>this.#keys.delete(event.code));
    window.addEventListener('blur',()=>{this.#keys.clear();this.#dragging=false;});
  }
  #walk(delta:number) {
    let forward=Number(this.#keys.has('KeyW')||this.#keys.has('ArrowUp'))-Number(this.#keys.has('KeyS')||this.#keys.has('ArrowDown'));
    let right=Number(this.#keys.has('KeyD')||this.#keys.has('ArrowRight'))-Number(this.#keys.has('KeyA')||this.#keys.has('ArrowLeft'));
    const norm=Math.hypot(forward,right)||1;forward/=norm;right/=norm;
    const speed=delta*(this.#keys.has('ShiftLeft')?5.0:2.8);
    const dx=(-Math.sin(this.#yaw)*forward+Math.cos(this.#yaw)*right)*speed;
    const dz=(-Math.cos(this.#yaw)*forward-Math.sin(this.#yaw)*right)*speed;
    let x=this.camera.position.x,y=-this.camera.position.z;
    const feet=this.camera.position.y-1.65;
    if(!this.collision.blocked(x+dx,y,feet))x+=dx;
    if(!this.collision.blocked(x,y-dz,feet))y-=dz;
    const height=this.collision.groundHeight(x,y,feet);
    this.camera.position.set(x,THREE.MathUtils.lerp(this.camera.position.y,height+1.65,1-Math.exp(-delta*15)),-y);
    this.controls.target.copy(this.camera.position).addScaledVector(this.camera.getWorldDirection(new THREE.Vector3()),7);
  }
  #frame(time:number) {
    if(this.#disposed)return;
    const raw=this.#lastTime?(time-this.#lastTime)/1000:1/60;
    const delta=Math.min(raw,.05);
    this.#lastTime=time;this.#elapsed=time/1000;this.#frames++;
    if(this.#ready&&document.visibilityState==='visible') {
      this.#samples.push(raw);
      if(this.#samples.length>180)this.#samples.shift();
    }
    const state=this.state.snapshot();
    if(state.playing) {
      this.#autoTime+=delta;
      if(this.#autoTime>.10){this.state.setTime((state.hour+this.#autoTime/20)%24);this.#autoTime=0;}
    }
    if(this.#tween){
      const p=THREE.MathUtils.clamp((this.#elapsed-this.#tween.start)/this.#tween.duration,0,1);
      const t=p*p*(3-2*p);
      this.camera.position.lerpVectors(this.#tween.from,this.#tween.to,t);
      this.controls.target.lerpVectors(this.#tween.targetFrom,this.#tween.targetTo,t);
      this.camera.lookAt(this.controls.target);
      if(p===1){this.#tween.complete();this.#tween=null;}
    }
    if(this.#walking&&!this.#inputBlocked)this.#walk(delta);else if(!this.#inputBlocked)this.controls.update();
    this.assets.update(this.camera,state.activeLandmark);
    const span=THREE.MathUtils.clamp(this.camera.position.distanceTo(this.controls.target)*.65,10,130);
    this.environment.update(delta,this.camera,this.controls.target,span);
    this.#bloom.enabled=this.environment.night>.02;
    this.#ao.enabled=this.#quality==='fine'&&(this.camera.position.y<28||this.camera.position.distanceTo(this.controls.target)<85);
    this.#shadowTime+=delta;
    const shadowChanged=this.#shadowTarget.distanceToSquared(this.controls.target)>.16||Math.abs(span-this.#shadowSpan)>.3||this.#shadowDirection.distanceToSquared(this.environment.direction)>.00001;
    if(shadowChanged&&this.#shadowTime>.15){
      this.environment.sun.shadow.needsUpdate=true;
      this.#shadowTime=0;
      this.#shadowTarget.copy(this.controls.target);
      this.#shadowDirection.copy(this.environment.direction);
      this.#shadowSpan=span;
    }
    this.environment.sun.shadow.normalBias=span<40?.012:.025;
    if(this.#water){
      const u=this.#water.material.uniforms;
      u.time!.value+=delta*(state.weather==='rain'?.65:.25);
      u.sunDirection!.value.copy(this.environment.direction);
      u.sunColor!.value.copy(this.environment.sun.color).multiplyScalar(1-this.environment.night*.8);
      u.waterColor!.value.set(state.weather==='snow'?0x627f79:state.weather==='rain'?0x284d4d:0x3d7566);
      u.distortionScale!.value=state.weather==='rain'?1.25:.55;
    }
    if(this.#lanternLights.length){
      const nearest=[...this.assets.pairs.values()].sort((a,b)=>a.lod.position.distanceToSquared(this.camera.position)-b.lod.position.distanceToSquared(this.camera.position)).slice(0,this.#lanternLights.length);
      nearest.forEach((pair,i)=>{
        const light=this.#lanternLights[i]!;
        light.position.copy(worldPoint([0,-pair.spec.size[1]*.20,2.7],pair.spec));
        light.intensity=this.environment.night*26*(state.landmarks[pair.spec.id]?.activity??1);
      });
    }
    this.renderer.info.reset();
    if(!this.#ready)return;
    this.#ao.setGBuffer(this.#composer.readBuffer.depthTexture!);
    this.#composer.render(delta);
    this.dispatchEvent(new CustomEvent('frame',{detail:{time:this.#elapsed,delta}}));
    if(this.#frames%30===0)this.#canvas.dataset.frames=String(this.#frames);
  }
  diagnostics() {
    const average=this.#samples.reduce((a,b)=>a+b,0)/(this.#samples.length||1);
    const sorted=[...this.#samples].sort((a,b)=>a-b);
    return {ready:this.#ready,frames:this.#frames,fps:average?Math.round(1/average):0,
      p95Ms:Math.round((sorted[Math.floor(sorted.length*.95)]??0)*1000),
      drawCalls:this.renderer.info.render.calls,renderedTriangles:this.renderer.info.render.triangles,
      loadedLandmarks:this.assets.pairs.size,materials:this.assets.materialCount,
      geometryCount:this.renderer.info.memory.geometries,textureCount:this.renderer.info.memory.textures,
      programCount:this.renderer.info.programs?.length??0,
      highDetail:[...this.assets.pairs].filter(([,pair])=>pair.high).map(([id])=>id),assetError:this.assets.error,
      streaming:this.assets.diagnostics(),
      navigation:this.#walking?'walk':'orbit',inputBlocked:this.#inputBlocked,quality:this.#quality,transitioning:!!this.#tween,
      cameraPosition:this.camera.position.toArray()};
  }
}
