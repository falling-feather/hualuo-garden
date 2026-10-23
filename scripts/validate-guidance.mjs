import {readFile,writeFile} from 'node:fs/promises';
import {RouteGuide} from '../src/domain/guidance.ts';
import {GardenCollision} from '../src/domain/collision.ts';
import {MEMORIES,memoryPosition} from '../src/domain/narrative.ts';
import {TABLE_LARGE,TABLE_SMALL,CUP_DELIVERY,CUP_RETURN_VIEW,tablePosition,placePoint} from '../src/domain/journey-places.ts';
const m=JSON.parse(await readFile('public/garden.manifest.json','utf8'));
const c=new GardenCollision(m.terrain,m.colliders,m.surfaces,m.water.level);
const room=m.landmarks.find(s=>s.id==='qiushuang'),table=tablePosition(room,(x,y,z)=>c.groundHeight(x,y,z));
for(const [offset,size]of [[TABLE_LARGE.x,TABLE_LARGE.size],[TABLE_SMALL.end,TABLE_SMALL.size]]){
 const x=table[0]+offset*Math.cos(room.rotation),y=table[1]+offset*Math.sin(room.rotation);
 c.addCollider({center:[x,y,table[2]+size[2]/2],size,rotation:room.rotation,kind:'journey-table'});
}
const guide=new RouteGuide(m.circulation,m.landmarks,(a,b)=>c.canWalkSegment(a,b),(x,y)=>c.terrainHeight(x,y));
let from=[0,-90,c.groundHeight(0,-90,.45)];const routes=[];
for(const memory of MEMORIES){
 const target=memoryPosition(memory,m.landmarks.find(s=>s.id===memory.landmark));
 await guide.prepare(target);const start=performance.now(),path=guide.plan(from,target),ms=performance.now()-start;
 const blocked=path?.points.slice(1).flatMap((b,i)=>c.canWalkSegment(path.points[i],b)?[]:[{from:path.points[i],to:b}])??[];
 routes.push({memory:memory.id,reachable:!!path,points:path?.points.length??0,length:path?.length??0,warmPlanningMs:+ms.toFixed(2),blocked});from=target;
}
const temple=m.landmarks.find(s=>s.id==='longcui'),pickup=memoryPosition(MEMORIES.find(s=>s.id==='tea'),temple),door=placePoint(CUP_DELIVERY,temple),outside=placePoint(CUP_RETURN_VIEW.eye,temple);
pickup[2]=c.groundHeight(pickup[0],pickup[1],pickup[2]);door[2]=c.groundHeight(door[0],door[1],door[2]);outside[2]=c.groundHeight(outside[0],outside[1],outside[2]-1.65);
const cupPassage=c.canWalkSegment(pickup,door)&&c.canWalkSegment(door,outside);
const result={passed:routes.every(route=>route.reachable&&!route.blocked.length)&&cupPassage,furnitureColliders:2,cupPassage,routes};
await writeFile('output/qa/journey-guide-routes.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
