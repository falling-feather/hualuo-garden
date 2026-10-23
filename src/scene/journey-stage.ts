import * as THREE from 'three';
import type {GardenViewer} from './viewer.ts';
import type {NarrativeSession} from '../domain/narrative.ts';
import {canReachMemory,memoryById,memoryPosition} from '../domain/narrative.ts';
import type {EncounterId,PaintingSubject,JourneyActions} from '../domain/journey.ts';
import {actionComplete,experienceText} from '../domain/journey.ts';
import {CUP_DELIVERY,CUP_RETURN_VIEW,TABLE_STAGE,TABLE_LARGE,TABLE_SMALL,placePoint,tablePosition,isOutsideCupDoor} from '../domain/journey-places.ts';
import type {ViewCheckpoint} from '../domain/view.ts';
import type {Interactions} from '../domain/interactions.ts';
import type {Vec3} from '../domain/types.ts';
import {createBanquetProps,createCupBundle,createTeaVessel} from './journey-props.ts';

const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
export class JourneyStage {
 #viewer:GardenViewer;#session:NarrativeSession;#interactions:Interactions;#change:()=>void;#input:()=>void;
 #started:()=>boolean;
 #active:EncounterId|null=null;#returnView:ViewCheckpoint|null=null;#subject:PaintingSubject='water';#busy=false;
 #table:ReturnType<typeof createBanquetProps>;#bundle:ReturnType<typeof createCupBundle>;#held=createTeaVessel();
 #delivery:Vec3;#ray=new THREE.Raycaster();#plane=new THREE.Plane();#hit=new THREE.Vector3();#pointer=new THREE.Vector2();
 #drag:{id:number;x:number;progress:number}|null=null;#lastCheck=0;
 #colliders:Array<()=>void>=[];#tableRotation:number;
 constructor(viewer:GardenViewer,session:NarrativeSession,interactions:Interactions,changed:()=>void,syncInput:()=>void,started:()=>boolean){
  this.#viewer=viewer;this.#session=session;this.#interactions=interactions;this.#change=changed;this.#input=syncInput;
  this.#started=started;
  const wood=this.#material('wood',new THREE.MeshStandardMaterial({color:'#68442c',roughness:.68}));
  this.#table=createBanquetProps(wood);const qiushuang=viewer.manifest.landmarks.find(s=>s.id==='qiushuang')!;
  this.#tableRotation=qiushuang.rotation;
  const center=tablePosition(qiushuang,(x,y,z)=>viewer.collision.groundHeight(x,y,z));
  this.#table.group.position.set(center[0],center[2],-center[1]);this.#table.group.rotation.y=qiushuang.rotation;this.#table.group.visible=false;viewer.scene.add(this.#table.group);
  const longcui=viewer.manifest.landmarks.find(s=>s.id==='longcui')!;
  this.#delivery=placePoint(CUP_DELIVERY,longcui);this.#delivery[2]=viewer.collision.groundHeight(this.#delivery[0],this.#delivery[1],this.#delivery[2]);
  this.#bundle=createCupBundle(this.#material('paper',new THREE.MeshStandardMaterial({color:'#b7a681',roughness:.96,side:THREE.DoubleSide})));
  this.#bundle.group.position.set(this.#delivery[0],this.#delivery[2]+.012,-this.#delivery[1]);this.#bundle.group.rotation.y=longcui.rotation;this.#bundle.group.visible=false;viewer.scene.add(this.#bundle.group);
  this.#held.visible=false;viewer.scene.add(this.#held);
  interactions.register({id:'journey.painting.capture',landmarkId:'qinfang',label:'留一景给园外的人',position:[-4,0,.75],kind:'object',onActivate:()=>{
   if(this.#active!=='painting'||!this.#near('painting'))throw new Error('请在沁芳水边取景');
   const box=el('viewfinder').getBoundingClientRect(),view=viewer.viewCheckpoint();view.landmark=memoryById('painting').landmark;
   this.#session.keepPainting(this.#subject,viewer.captureGarden(box),view);this.#change();this.#render();
  }});
  interactions.register({id:'journey.banquet.move',landmarkId:'qiushuang',label:'挪近席边小桌',position:TABLE_STAGE,kind:'object',onActivate:()=>{
   if(this.#active!=='banquet'||this.#busy)throw new Error('请先在小桌旁走进这一幕');
   this.#moveTable(Math.min(1,this.#session.snapshot().actions.table+.25));this.#change();
  }});
  interactions.register({id:'journey.tea.wrap',landmarkId:'longcui',label:'把杯子包好送出门槛',position:CUP_DELIVERY,kind:'object',onActivate:async()=>{
   if(!this.#canDeliver())throw new Error('先接过杯子，再走到山门外包袱旁');
   this.#session.wrapCup();this.#active='tea';document.body.classList.add('stage-active');this.#change();this.#render();
   this.#busy=true;this.#input();this.#render();try{await viewer.arrive('longcui',CUP_RETURN_VIEW.eye,CUP_RETURN_VIEW.look);}finally{this.#busy=false;this.#input();this.#change();this.#render();}
  }});
  el('stage-close').addEventListener('click',()=>this.close());
  el('stage-primary').addEventListener('click',()=>this.#primary().catch(e=>this.#error(e)));
  el('stage-secondary').addEventListener('click',()=>this.close());
  for(const button of document.querySelectorAll<HTMLButtonElement>('[data-subject]'))button.addEventListener('click',()=>this.#chooseSubject(button.dataset.subject as PaintingSubject).catch(e=>this.#error(e)));
  el('cup-deliver').addEventListener('click',()=>this.#interactions.activate('journey.tea.wrap').catch(e=>this.#error(e)));
  const canvas=viewer.renderer.domElement;
  canvas.addEventListener('pointerdown',event=>{
   if(this.#active!=='banquet'||this.#busy||this.#session.snapshot().actions.table>=1)return;
   this.#rayAt(event);if(!this.#ray.intersectObject(this.#table.small,true).length)return;
   this.#plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0,1,0),this.#table.group.position.clone().add(new THREE.Vector3(0,.53,0)));
   if(!this.#ray.ray.intersectPlane(this.#plane,this.#hit))return;
   this.#drag={id:event.pointerId,x:this.#hit.x,progress:this.#session.snapshot().actions.table};canvas.setPointerCapture(event.pointerId);event.preventDefault();
  });
  canvas.addEventListener('pointermove',event=>{
   if(!this.#drag||this.#drag.id!==event.pointerId)return;this.#rayAt(event);
   if(this.#ray.ray.intersectPlane(this.#plane,this.#hit))this.#moveTable(THREE.MathUtils.clamp(this.#drag.progress+(this.#hit.x-this.#drag.x)/1.1,0,1));
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>{if(this.#drag){this.#drag=null;this.#change();}});
  viewer.addEventListener('frame',event=>this.#frame((event as CustomEvent<{time:number}>).detail.time));
 }
 #material(name:string,fallback:THREE.MeshStandardMaterial){let found:THREE.MeshStandardMaterial|undefined;this.#viewer.assets.group.traverse(o=>{if(o instanceof THREE.Mesh&&!Array.isArray(o.material)&&o.material instanceof THREE.MeshStandardMaterial&&o.material.name===name)found=o.material;});const material=found?found.clone():fallback;if(found)fallback.dispose();this.#viewer.environment.prepareMaterial(material,'architecture');return material;}
 get active(){return this.#active;}
 get locked(){return this.#active==='banquet'||this.#busy;}
 get safeView(){return this.#active==='banquet'?this.#returnView:null;}
 get delivery(){return [...this.#delivery] as Vec3;}
 #near(id:EncounterId){const v=this.#viewer,c=v.camera.position,spec=v.manifest.landmarks.find(s=>s.id===memoryById(id).landmark)!;const p=memoryPosition(memoryById(id),spec);return canReachMemory([c.x,-c.z,c.y],p,v.collision.lineOfSight([c.x,-c.z,c.y],[p[0],p[1],p[2]+1.22]));}
 async begin(id:EncounterId){
  if(this.#session.snapshot().ended)throw new Error('雪后可回读经历，重新游园才会改变它');
  if(!this.#near(id))throw new Error('请先走近这一处记忆');
  this.#active=id;this.#returnView=this.#viewer.viewCheckpoint();document.body.classList.add('stage-active');
  if(id==='banquet'){
   this.#table.group.visible=true;this.#moveTable(this.#session.snapshot().actions.table);
   const center=this.#table.group.position;this.#busy=true;this.#input();this.#render();
   const mobile=innerWidth<=700,available=mobile?1:(innerWidth-el('journey-stage').getBoundingClientRect().width-68)/innerWidth;
   const distance=Math.min(4.2,3.3*Math.max(1,.72/available)),offset=mobile?-1.1:-.7-(.72-available)*2.5;
   const ex=center.x-.65,ey=-center.z+distance,ez=this.#viewer.collision.groundHeight(ex,ey,center.y)+1.65;
   await this.#viewer.frameScene([ex,ey,ez],[center.x+offset,-center.z,center.y+.55]);this.#busy=false;
  }
  if(id==='painting')await this.#chooseSubject('water');
  this.#render();this.#input();
 }
 async close(){
  const previous=this.#active,view=this.#returnView;this.#active=null;this.#returnView=null;
  document.body.classList.remove('stage-active','framing');el('journey-stage').hidden=true;el('viewfinder').hidden=true;
  if(previous==='banquet'&&view){this.#busy=true;this.#input();try{await this.#viewer.restoreView(view);}finally{this.#busy=false;}}
  this.#input();this.#change();el('garden').focus({preventScroll:true});
 }
 async #chooseSubject(subject:PaintingSubject){
  if(this.#active!=='painting'||this.#busy)return;this.#subject=subject;
  const v=this.#viewer,spec=v.manifest.landmarks.find(s=>s.id==='qinfang')!,screen=v.manifest.landmarks.find(s=>s.id==='screen')!;
  const target=subject==='water'?placePoint([4,2,1.4],spec):[screen.position[0],screen.position[1],screen.position[2]+1.8] as Vec3,view=v.viewCheckpoint();
  const direction=new THREE.Vector3(target[0]-view.eye[0],target[1]-view.eye[1],target[2]-view.eye[2]).normalize().toArray() as Vec3;
  await v.restoreView({...view,direction});this.#render();
 }
 #moveTable(progress:number){
  if(progress>.94)progress=1;if(!this.#session.snapshot().actions.beside)this.#session.moveTable(progress);this.#table.small.position.x=TABLE_SMALL.start+progress*(TABLE_SMALL.end-TABLE_SMALL.start);this.#viewer.environment.sun.shadow.needsUpdate=true;this.#render();
 }
 async #primary(){
  const id=this.#active;if(!id||this.#busy)return;const actions=this.#session.snapshot().actions;
  if(actionComplete(id,actions)){await this.close();return;}
  if(id==='painting'){await this.#interactions.activate('journey.painting.capture');return;}
  if(id==='banquet'){
   if(actions.table<1){await this.#interactions.activate('journey.banquet.move');return;}
   const p=this.#table.group.position;this.#busy=true;this.#input();this.#render();
   try{await this.#viewer.frameScene([p.x-.4,-p.z+.75,p.y+1.03],[p.x+.35,-p.z,p.y+.58]);this.#session.sitBeside();this.#change();}finally{this.#busy=false;this.#render();this.#input();}return;
  }
  if(actions.cup==='waiting'){
   if(!this.#near('tea'))throw new Error('请先在茶盏旁接杯');this.#session.takeCup();this.#change();
   const view=this.#viewer.viewCheckpoint(),direction=new THREE.Vector3(this.#delivery[0]-view.eye[0],this.#delivery[1]-view.eye[1],0).normalize().toArray() as Vec3;
   await this.#viewer.restoreView({...view,direction,mode:'walk'});this.#render();return;
  }
  if(this.#canDeliver())await this.#interactions.activate('journey.tea.wrap');
 }
 handleKey(){
  if(this.#active){this.#primary().catch(e=>this.#error(e));return true;}
  if(this.#session.snapshot().actions.cup==='carrying'&&this.#canDeliver()){this.#interactions.activate('journey.tea.wrap').catch(e=>this.#error(e));return true;}return false;
 }
 resumeCarry(){if(this.#session.snapshot().actions.cup==='carrying'){this.#active='tea';document.body.classList.add('stage-active');this.#render();}}
 synchronize(){this.#syncTables(this.#session.snapshot().actions);}
 #canDeliver(){
  if(this.#session.snapshot().actions.cup!=='carrying'||this.#session.snapshot().ended)return false;
  const p=this.#viewer.camera.position,t=this.#delivery;
  const spec=this.#viewer.manifest.landmarks.find(s=>s.id==='longcui')!;
  return isOutsideCupDoor([p.x,-p.z,p.y],spec)&&Math.hypot(p.x-t[0],-p.z-t[1])<1.65&&Math.abs(p.y-1.65-t[2])<.75&&this.#viewer.collision.lineOfSight([p.x,-p.z,p.y],[t[0],t[1],t[2]+.7]);
 }
 #render(){
  const id=this.#active,actions=this.#session.snapshot().actions,complete=id&&actionComplete(id,actions);el('journey-stage').hidden=!id;
  el('viewfinder').hidden=id!=='painting'||!!complete;document.body.classList.toggle('framing',id==='painting'&&!complete);
  if(!id)return;el('journey-stage').dataset.scene=id;el('journey-stage').dataset.complete=String(!!complete);
  el('stage-title').textContent=id==='painting'?'留一景给园外的人':id==='banquet'?'把小桌挪近一些':'同一只杯，走过门槛';
  const text=complete?experienceText(id,actions):id==='painting'?'选亭台水光，或回看来时的曲径。可以拖动画面转身，画框中这一景会真实留进拾忆册。':id==='banquet'?(actions.table<1?'贾母让小桌挨近自己。拖动眼前的小桌，向席面挪近；也可按 E 或下方按钮逐步挪动。':'小桌近了。再换到刘姥姥这一边坐看，同一席饭会显出不同的分量。'):experienceText('tea',actions);
  el('stage-text').textContent=text;el('stage-subjects').hidden=id!=='painting'||!!complete;
  const picture=el<HTMLImageElement>('stage-picture');picture.hidden=id!=='painting'||!actions.painting;if(!picture.hidden&&actions.painting)picture.src=actions.painting.image;
  for(const button of document.querySelectorAll<HTMLButtonElement>('[data-subject]'))button.setAttribute('aria-pressed',String(button.dataset.subject===this.#subject));
  const primary=el<HTMLButtonElement>('stage-primary');primary.textContent=complete?'带着这段经历继续 →':id==='painting'?'把这一景收进画笺':id==='banquet'?(actions.table<1?'挪近一点 →':'换到她这一边'):actions.cup==='waiting'?'接过这只杯子':this.#canDeliver()?'把杯子包好':'走向山门外的包袱';
  primary.disabled=this.#busy||id==='tea'&&actions.cup==='carrying'&&!this.#canDeliver();
  el('stage-secondary').textContent=id==='tea'&&actions.cup==='carrying'?'收起提示，继续送杯':'暂回园中';
  el('stage-origin').textContent='场景演绎 · '+(id==='tea'?'五彩小盖钟据原文造型；代丫鬟送杯的步行由本作补足':'动作与机位由本作编排，原著不记录玩家参与');
  el('stage-progress').textContent=id==='banquet'&&!complete?(actions.table<1?'小桌与席面之间，还隔着一段距离':'小桌近了，再换一个位置看席面'):'经历会保留在本机浏览器';
 }
 #rayAt(event:PointerEvent){const box=this.#viewer.renderer.domElement.getBoundingClientRect();this.#pointer.set((event.clientX-box.left)/box.width*2-1,1-(event.clientY-box.top)/box.height*2);this.#ray.setFromCamera(this.#pointer,this.#viewer.camera);}
 #error(error:unknown){el('stage-text').textContent=error instanceof Error?error.message:String(error);}
 #syncTables(actions:JourneyActions){
  this.#table.group.visible=this.#active==='banquet'||actions.beside;
  this.#table.small.position.x=TABLE_SMALL.start+actions.table*(TABLE_SMALL.end-TABLE_SMALL.start);
  if(actions.beside&&!this.#colliders.length){
   for(const [x,size]of [[TABLE_LARGE.x,TABLE_LARGE.size],[TABLE_SMALL.end,TABLE_SMALL.size]] as const){const center=this.#table.group.localToWorld(new THREE.Vector3(x,size[2]/2,0));this.#colliders.push(this.#viewer.collision.addCollider({center:[center.x,-center.z,center.y],size:[...size],rotation:this.#tableRotation,kind:'journey-table'}));}
   this.#viewer.environment.sun.shadow.needsUpdate=true;this.#viewer.dispatchEvent(new Event('obstacleschange'));
  }else if(!actions.beside&&this.#colliders.length){for(const remove of this.#colliders)remove();this.#colliders=[];this.#viewer.environment.sun.shadow.needsUpdate=true;this.#viewer.dispatchEvent(new Event('obstacleschange'));}
 }
 #frame(time:number){
  if(!this.#started()){this.#held.visible=false;this.#bundle.group.visible=false;return;}
  const actions=this.#session.snapshot().actions,p=this.#viewer.camera.position;this.#syncTables(actions);
  const dragHint=el('table-drag-hint');dragHint.hidden=this.#active!=='banquet'||actions.table>=1;
  if(!dragHint.hidden){const point=this.#table.small.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.54,0)).project(this.#viewer.camera),target=this.#table.group.localToWorld(new THREE.Vector3(TABLE_SMALL.end,.54,0)).project(this.#viewer.camera);dragHint.textContent=target.x<point.x?'← 挪近小桌':'挪近小桌 →';dragHint.style.left=(point.x+1)*innerWidth/2+'px';dragHint.style.top=(1-point.y)*innerHeight/2+'px';}
  this.#held.visible=actions.cup==='carrying'&&!this.#session.snapshot().ended;
  if(this.#held.visible){this.#held.position.copy(p).add(new THREE.Vector3(-.24,-.15,-.64).applyQuaternion(this.#viewer.camera.quaternion));this.#held.quaternion.copy(this.#viewer.camera.quaternion);this.#held.rotateX(.10);}
  this.#bundle.group.visible=actions.cup!=='waiting';this.#bundle.knot.visible=actions.cup==='wrapped';this.#bundle.cup.visible=actions.cup==='wrapped';this.#bundle.wrapped.visible=actions.cup==='wrapped';
  const button=el<HTMLButtonElement>('cup-deliver'),show=this.#canDeliver()&&!this.#viewer.inputBlocked;
  button.hidden=!show;
  if(show){const labelHeight=Math.max(1.22,p.y-this.#bundle.group.position.y-.12),projected=this.#bundle.group.position.clone().add(new THREE.Vector3(0,labelHeight,0)).project(this.#viewer.camera);button.hidden=projected.z<0||projected.z>1||Math.abs(projected.x)>.9||Math.abs(projected.y)>.9;button.style.left=(projected.x+1)*innerWidth/2+'px';button.style.top=(1-projected.y)*innerHeight/2+'px';}
  if(time-this.#lastCheck>.25){this.#lastCheck=time;if(this.#active==='tea'||this.#active==='painting')this.#render();}
 }
}
