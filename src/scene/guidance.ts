import * as THREE from 'three';
import {RouteGuide} from '../domain/guidance.ts';
import {MEMORIES,memoryPosition} from '../domain/narrative.ts';
import type {Vec2,Vec3} from '../domain/types.ts';
import type {GardenViewer} from './viewer.ts';
import type {GardenNarrative} from './narrative.ts';
import {CUP_DELIVERY,placePoint} from '../domain/journey-places.ts';

const PLACE_NOTES:Record<string,string>={
 gate:'元春是宝玉的姐姐，也已是皇妃。迎接她归家省亲的园子，后来成了宝玉与姐妹们读书、作诗、起居的地方。',
 screen:'山石先把全景藏住，转过曲径再见水光。留意石径的转弯，不必直穿山石。',
 qinfang:'刘姥姥在这处水边，把眼前的园子比作年画。此刻，你也从远远看画，走进了画里。',
 xiaoxiang:'竹影间是黛玉的居所。园中的住处，各有花木，也各有人的性情。',
 qiushuang:'这里与探春的日常相连。晓翠堂的一席早饭，让照拂、笑声和不同的生活尺度相遇。',
 longcui:'妙玉在此修行。茶、梅花雪与杯盏都很讲究，也让园内外不同的生活经验碰到一起。',
 guensi:'元妃省亲时的礼仪正殿。楼阁和匾额记住了家族的荣耀，富贵中的人也曾为离别叹息。',
 daguanlou:'正楼名为大观楼。楼后的北坡留有一处回望，等三段记忆读毕，再慢慢走去。',
};
const WHISPERS:Record<string,string>={painting:'循着水声，去沁芳亭边看看。有人想把这一园好景带回家。',banquet:'秋爽斋里曾响起满堂笑声。沿石径走近，听听笑声中的人。',tea:'往栊翠庵走，一只茶杯，会让你看见另一种距离。',ending:'三段相遇已留在册中。沿园路绕向楼后的北坡，再回头看一次。'};
const el=(id:string)=>document.getElementById(id)!;
export class GardenGuidance {
 #viewer:GardenViewer;#story:GardenNarrative;#router:RouteGuide;#enabled=true;#seen=new Set<string>();#lastTime=-Infinity;#lastPosition:Vec3|null=null;#key='';#route:Vec3[]=[];#noteUntil=0;#notePlace:string|null=null;
 #leaves:THREE.InstancedMesh;#material=new THREE.MeshBasicMaterial({color:'#e7cc85',transparent:true,opacity:.38,depthWrite:false,side:THREE.DoubleSide});
 #dummy=new THREE.Object3D();#maxPlanningMs=0;#reduced=matchMedia('(prefers-reduced-motion: reduce)');
 #prepared=new Set<string>();
 #preparation=0;
 #mapPoint:(x:number,y:number)=>Vec2;
 constructor(viewer:GardenViewer,story:GardenNarrative,mapPoint:(x:number,y:number)=>Vec2){
  this.#viewer=viewer;this.#story=story;
  this.#mapPoint=mapPoint;
  const collision=viewer.collision;
  this.#router=new RouteGuide(viewer.manifest.circulation,viewer.manifest.landmarks,(a,b)=>collision.canWalkSegment(a,b),(x,y)=>collision.terrainHeight(x,y));
  viewer.addEventListener('obstacleschange',()=>{
   this.#router=new RouteGuide(viewer.manifest.circulation,viewer.manifest.landmarks,(a,b)=>collision.canWalkSegment(a,b),(x,y)=>collision.terrainHeight(x,y));this.#prepared.clear();this.#key='';this.#lastPosition=null;this.#leaves.count=0;
   this.#prepare().catch(error=>viewer.dispatchEvent(new CustomEvent('error',{detail:error})));
  });
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,-.12,-.042,0,-.015,0,.012,.13,.042,0,-.015],3));geometry.setIndex([0,1,2,0,2,3]);geometry.computeVertexNormals();
  this.#leaves=new THREE.InstancedMesh(geometry,this.#material,24);this.#leaves.count=0;this.#leaves.frustumCulled=false;viewer.scene.add(this.#leaves);
  el('guide-toggle').addEventListener('click',()=>{this.#enabled=!this.#enabled;this.#key='';this.#lastPosition=null;this.#setToggle();this.#update(Number.isFinite(this.#lastTime)?this.#lastTime:0);});
  story.addEventListener('reset',()=>{this.#seen.clear();this.#key='';this.#lastPosition=null;});
  viewer.addEventListener('frame',event=>{
   const time=(event as CustomEvent<{time:number}>).detail.time;
   if(time-this.#lastTime>.6){this.#update(time);this.#lastTime=time;}
   this.#material.opacity=this.#reduced.matches?.34:.31+Math.sin(time*1.6)*.08;
  });
  this.#setToggle();
  this.#prepare().catch(error=>viewer.dispatchEvent(new CustomEvent('error',{detail:error})));
 }
 #goal(id:string):Vec3{
  const next=MEMORIES.find(memory=>memory.id===id)!,spec=this.#viewer.manifest.landmarks.find(spec=>spec.id===next.landmark)!;
  return id==='tea'&&this.#story.snapshot().actions.cup==='carrying'?placePoint(CUP_DELIVERY,spec):memoryPosition(next,spec);
 }
 async #prepare(){const generation=++this.#preparation,router=this.#router;for(const memory of MEMORIES){const spec=this.#viewer.manifest.landmarks.find(s=>s.id===memory.landmark)!;await router.prepare(memoryPosition(memory,spec));if(generation!==this.#preparation)return;this.#prepared.add(memory.id);}const spec=this.#viewer.manifest.landmarks.find(s=>s.id==='longcui')!;await router.prepare(placePoint(CUP_DELIVERY,spec));if(generation===this.#preparation)this.#prepared.add('tea-carry');}
 #setToggle(){el('guide-toggle').setAttribute('aria-pressed',String(this.#enabled));el('guide-toggle').textContent=this.#enabled?'收起引线':'展开引线';document.body.classList.toggle('guided',this.#enabled);}
 #update(time:number){
  const viewer=this.#viewer,session=this.#story.snapshot(),camera=viewer.camera.position,foot:Vec3=[camera.x,-camera.z,camera.y-1.65];
  const active=viewer.state.snapshot().activeLandmark;
  if(session.started&&viewer.navigation==='walk'&&!viewer.inputBlocked&&active&&!this.#seen.has(active)&&PLACE_NOTES[active]){
   this.#seen.add(active);el('place-context').textContent=PLACE_NOTES[active]!;this.#noteUntil=time+18;this.#notePlace=active;
  }
  el('place-context').hidden=time>this.#noteUntil||!session.started||viewer.navigation!=='walk'||active!==this.#notePlace;
  const map=(p:Vec3)=>this.#mapPoint(p[0],p[1]);
  const current=map(foot);el('map-current').setAttribute('cx',String(current[0]));el('map-current').setAttribute('cy',String(current[1]));
  el('map-current').setAttribute('visibility',viewer.navigation==='walk'?'visible':'hidden');
  const showing=this.#enabled&&session.started&&!session.ended;
  el('route-whisper').hidden=!showing;this.#leaves.visible=showing&&!viewer.inputBlocked&&viewer.navigation==='walk';
  if(!showing){this.#leaves.count=0;el('map-guide').setAttribute('points','');return;}
  const carrying=session.actions.cup==='carrying';
  const next=carrying?MEMORIES.find(memory=>memory.id==='tea')!:MEMORIES.find(memory=>memory.id!=='ending'&&!session.completed.includes(memory.id))??MEMORIES.find(memory=>memory.id==='ending')!;
  const key=next.id+(carrying?'-carry':'');
  el('route-whisper').textContent=carrying?'手中的杯子要送到山门外。沿引线过门槛，在包袱旁按 E。':WHISPERS[next.id]!;
  if(viewer.inputBlocked||viewer.navigation!=='walk'||session.traveling)return;
  if(!this.#prepared.has(key))return;
  if(this.#key!==key||!this.#lastPosition||Math.hypot(foot[0]-this.#lastPosition[0],foot[1]-this.#lastPosition[1])>1.1){
   const goal=this.#goal(next.id);
   const start=performance.now(),route=this.#router.plan(foot,goal);this.#maxPlanningMs=Math.max(this.#maxPlanningMs,performance.now()-start);
   this.#route=route?.points??[];this.#lastPosition=foot;this.#key=key;
   el('route-whisper').dataset.target=next.id;el('route-whisper').dataset.routePoints=String(this.#route.length);el('route-whisper').dataset.maxPlanningMs=this.#maxPlanningMs.toFixed(1);
   el('map-guide').setAttribute('points',this.#route.map(p=>map(p).join(',')).join(' '));
   let count=0,remaining=1.3;
   for(let i=0;i<this.#route.length-1&&count<24;i++){
    const a=this.#route[i]!,b=this.#route[i+1]!,length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    while(remaining<length&&count<24){
     const t=remaining/(length||1),x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t,z=viewer.collision.groundHeight(x,y,a[2]+(b[2]-a[2])*t);
     this.#dummy.position.set(x,z+.065,-y);this.#dummy.rotation.set(0,Math.atan2(b[0]-a[0],-(b[1]-a[1]))+(count%3-.8)*.24,0);this.#dummy.updateMatrix();this.#leaves.setMatrixAt(count++,this.#dummy.matrix);remaining+=.65;
    }
    remaining-=length;
   }
   this.#leaves.count=count;this.#leaves.instanceMatrix.needsUpdate=true;
  }
 }
}
