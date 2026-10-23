import {GardenViewer} from './scene/viewer.ts';
import type {Manifest,Vec3} from './domain/types.ts';
const query=new URLSearchParams(location.search),study=query.get('source')==='study';
const manifest=await (await fetch(study?'/review/vegetation.manifest.json':'/garden.manifest.json')).json() as Manifest;
const viewer=new GardenViewer(document.getElementById('garden') as HTMLCanvasElement,manifest);
viewer.state.setTime(9.5);viewer.state.setSeason('autumn');
await viewer.load(()=>{});
const close:Vec3=study?[0,-6,1.65]:[-13,-64,0];
if(!study)close[2]=viewer.collision.groundHeight(close[0],close[1],2)+1.65;
const far=query.get('view')==='far',ground=query.get('view')==='ground',eye:Vec3=far?(study?[13,-18,10]:[-35,-80,10]):close;
const target:Vec3=ground?(study?[0,-2,0]:[-17,-61,close[2]-1.65]):study?[0,1,3]:[-48,-46,3.9];
viewer.controls.maxPolarAngle=Math.PI*.95;
viewer.camera.position.set(eye[0],eye[2],-eye[1]);viewer.controls.target.set(target[0],target[2],-target[1]);viewer.camera.lookAt(viewer.controls.target);viewer.controls.update();
document.getElementById('status')!.textContent=(study?'单体样片':'实际园景')+' · 秋日9:30 · 同一实时渲染管线';
document.documentElement.dataset.ready='true';
declare global{interface Window{vegetationReview:GardenViewer}}
window.vegetationReview=viewer;
