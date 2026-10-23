import {readFile,writeFile} from 'node:fs/promises';
import {GardenCollision} from '../src/domain/collision.ts';
const manifest=JSON.parse(await readFile('public/garden.manifest.json','utf8'));
const source=JSON.parse(await readFile('art/inscription-views.json','utf8'));
const collision=new GardenCollision(manifest.terrain,manifest.colliders,manifest.surfaces,manifest.water.level);
const views=source.views.map(view=>{
  const s=manifest.landmarks.find(s=>s.id===view.landmark),[x,y,z]=view.eye;
  const c=Math.cos(s.rotation),sn=Math.sin(s.rotation);
  const world=[s.position[0]+x*c-y*sn,s.position[1]+x*sn+y*c,s.position[2]+z];
  const feet=world[2]-1.65,ground=collision.groundHeight(world[0],world[1],feet);
  const blocked=collision.blocked(world[0],world[1],feet);
  return {id:view.id,world,feet,ground,blocked,passed:!blocked&&Math.abs(feet-ground)<.04};
});
const report={passed:views.every(v=>v.passed),scope:'Authored reading viewpoints are supported by exported walking surfaces and outside colliders; not a full route reachability proof.',views};
await writeFile('output/qa/reading-views.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
if(!report.passed)process.exitCode=1;
