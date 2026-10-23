import {readFile,writeFile} from 'node:fs/promises';
import {GardenCollision} from '../src/domain/collision.ts';
const m=JSON.parse(await readFile('public/garden.manifest.json','utf8'));
const collision=new GardenCollision(m.terrain,m.colliders,m.surfaces,m.water.level);
const failures=[];let samples=0,rails=0;
for(const route of m.circulation.routes){
 for(const reverse of [false,true]){
  const points=reverse?[...route.navigation].reverse():route.navigation;
  let feet=points[0][2],failed=false;
  for(let i=0;i<points.length-1&&!failed;i++){
   const a=points[i],b=points[i+1],distance=Math.hypot(b[0]-a[0],b[1]-a[1]);
   const steps=Math.max(1,Math.ceil(distance/.075));
   for(let j=1;j<=steps;j++){
    const t=j/steps,x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t,expected=a[2]+(b[2]-a[2])*t;
    const height=collision.groundHeight(x,y,feet);samples++;
    if(collision.blocked(x,y,feet)||Math.abs(height-expected)>.32){
     failures.push({id:route.id,reverse,position:[x,y,feet].map(v=>+v.toFixed(3)),actualHeight:+height.toFixed(3),expectedHeight:+expected.toFixed(3),reason:collision.blocked(x,y,feet)?'blocked':'surface mismatch'});failed=true;break;
    }
    feet=height;
   }
  }
 }
 for(let i=3;i<route.points.length-3;i+=7){
  if(!route.bridge[i])continue;
  const a=route.points[i-1],b=route.points[i+1],p=route.points[i];
  const length=Math.hypot(b[0]-a[0],b[1]-a[1]),nx=-(b[1]-a[1])/length,ny=(b[0]-a[0])/length;
  for(const sign of [-1,1]){
   const x=p[0]+nx*sign*(route.width/2+.06),y=p[1]+ny*sign*(route.width/2+.06);rails++;
   if(!collision.blocked(x,y,p[2]))failures.push({id:route.id,position:[x,y,p[2]].map(v=>+v.toFixed(3)),reason:'railing not blocking'});
  }
 }
}
const result={passed:failures.length===0,routes:m.circulation.routes.length,directionsPerRoute:2,walkingSamples:samples,railingProbes:rails,failures};
await writeFile('output/qa/walkways.json',JSON.stringify(result,null,2),'utf8');
console.log(JSON.stringify(result));
if(!result.passed)process.exitCode=1;
