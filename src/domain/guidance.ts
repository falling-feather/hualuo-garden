import type {Vec3,Landmark} from './types.ts';
type Network={nodes:{id:string;position:Vec3}[];routes:{from:string;to:string;navigation:Vec3[]}[]};
type Edge={to:string;points:Vec3[];cost:number};
type Graph={nodes:Map<string,Vec3>;edges:Map<string,Edge[]>};
const distance=(a:Vec3,b:Vec3)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const length=(points:Vec3[])=>points.slice(1).reduce((sum,p,i)=>sum+distance(points[i]!,p),0);
function connect(graph:Graph,a:string,b:string,points:Vec3[],reverse=true){
 const cost=length(points);graph.edges.get(a)!.push({to:b,points,cost});if(reverse)graph.edges.get(b)!.push({to:a,points:[...points].reverse(),cost});
}
export class RouteGuide {
 #base:Graph;#network:Network;#sites:Pick<Landmark,'position'|'size'|'rotation'>[];#walk:(a:Vec3,b:Vec3)=>boolean;#floor:(x:number,y:number)=>number;
 #goals=new Map<string,Graph>();
 constructor(network:Network,sites:Pick<Landmark,'position'|'size'|'rotation'>[],walk:(a:Vec3,b:Vec3)=>boolean,floor:(x:number,y:number)=>number){
  this.#network=network;this.#sites=sites;this.#walk=walk;this.#floor=floor;
  this.#base={nodes:new Map(network.nodes.map(n=>[n.id,[...n.position]])),edges:new Map(network.nodes.map(n=>[n.id,[]]))};
  for(const route of network.routes)connect(this.#base,route.from,route.to,route.navigation);
  // The exported network names exterior routes. Gate, bridge and gallery
  // interiors connect their own ports only when the same walking body fits.
  const ports=new Map<string,string[]>();
  for(const node of network.nodes)if(node.id.includes(':')){const site=node.id.split(':')[0]!,group=ports.get(site)??[];group.push(node.id);ports.set(site,group);}
  for(const group of ports.values())for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++){
   const a=group[i]!,b=group[j]!,p=this.#base.nodes.get(a)!,q=this.#base.nodes.get(b)!;
   if(this.#walk(p,q))connect(this.#base,a,b,[p,q],false);
   if(this.#walk(q,p))connect(this.#base,b,a,[q,p],false);
  }
 }
 *#buildGoal(target:Vec3):Generator<void,Graph,void>{
  const key=target.join(',');const cached=this.#goals.get(key);if(cached)return cached;
  const graph:Graph={nodes:new Map(this.#base.nodes),edges:new Map([...this.#base.edges].map(([id,edges])=>[id,[...edges]]))};
  const local=[...graph.nodes].sort((a,b)=>distance(a[1],target)-distance(b[1],target)).slice(0,12).map(([id])=>id);
  for(const [index,site] of this.#sites.entries()){
   if(Math.hypot(site.position[0]-target[0],site.position[1]-target[1])>32)continue;
   for(const [j,[sx,sy]] of [[-1,-1],[-1,1],[1,-1],[1,1]].entries()){
    const x=sx!* (site.size[0]/2+1.15),y=sy!*(site.size[1]/2+1.15),c=Math.cos(site.rotation),s=Math.sin(site.rotation);
    const px=site.position[0]+x*c-y*s,py=site.position[1]+x*s+y*c,id='.corner.'+index+'.'+j;
    graph.nodes.set(id,[px,py,this.#floor(px,py)]);graph.edges.set(id,[]);local.push(id);
   }
  }
  graph.nodes.set('.goal',target);graph.edges.set('.goal',[]);local.push('.goal');
  for(let i=0;i<local.length;i++)for(let j=i+1;j<local.length;j++){
   const a=local[i]!,b=local[j]!,p=graph.nodes.get(a)!,q=graph.nodes.get(b)!;
   if(this.#walk(p,q))connect(graph,a,b,[p,q],false);
   if(this.#walk(q,p))connect(graph,b,a,[q,p],false);
   yield;
  }
  this.#goals.set(key,graph);return graph;
 }
 #goal(target:Vec3){
  const builder=this.#buildGoal(target);let item=builder.next();while(!item.done)item=builder.next();return item.value;
 }
 async prepare(target:Vec3){
  const builder=this.#buildGoal(target);let item=builder.next(),slice=performance.now();
  while(!item.done){
   if(performance.now()-slice>5){await new Promise<void>(resolve=>setTimeout(resolve,0));slice=performance.now();}
   item=builder.next();
  }
 }
 plan(from:Vec3,target:Vec3):{points:Vec3[];length:number}|null{
  if(distance(from,target)<12&&this.#walk(from,target))return {points:[from,target],length:distance(from,target)};
  const goal=this.#goal(target),graph:Graph={nodes:new Map(goal.nodes),edges:new Map([...goal.edges].map(([id,edges])=>[id,[...edges]]))};
  graph.nodes.set('.start',from);graph.edges.set('.start',[]);
  const candidates=this.#network.routes.map(route=>{
   let closest={distance:Infinity,index:0,point:route.navigation[0]!};
   for(let i=0;i<route.navigation.length-1;i++){
    const a=route.navigation[i]!,b=route.navigation[i+1]!,dx=b[0]-a[0],dy=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((from[0]-a[0])*dx+(from[1]-a[1])*dy)/(dx*dx+dy*dy||1)));
    const point:Vec3=[a[0]+dx*t,a[1]+dy*t,a[2]+(b[2]-a[2])*t],d=distance(from,point);
    if(d<closest.distance)closest={distance:d,index:i,point};
   }
   return {route,...closest};
  }).sort((a,b)=>a.distance-b.distance).slice(0,6);
  for(const candidate of candidates){
   if(candidate.distance>20||!this.#walk(from,candidate.point))continue;
   const {route,index,point}=candidate;
   connect(graph,'.start',route.from,[from,point,...route.navigation.slice(0,index+1).reverse()],false);
   connect(graph,'.start',route.to,[from,point,...route.navigation.slice(index+1)],false);
  }
  if(!candidates.length)for(const [id,point] of [...goal.nodes].filter(([id])=>id!=='.goal'))if(distance(from,point)<20&&this.#walk(from,point))connect(graph,'.start',id,[from,point]);
  const scores=new Map<string,number>([['.start',0]]),previous=new Map<string,{id:string;edge:Edge}>(),pending=new Set(graph.nodes.keys());
  while(pending.size){
   let best:string|undefined,bestCost=Infinity;
   for(const id of pending){const cost=scores.get(id)??Infinity;if(cost<bestCost){best=id;bestCost=cost;}}
   if(!best)return null;if(best==='.goal')break;pending.delete(best);
   for(const edge of graph.edges.get(best)??[]){
    const cost=bestCost+edge.cost;if(cost<(scores.get(edge.to)??Infinity)){scores.set(edge.to,cost);previous.set(edge.to,{id:best,edge});}
   }
  }
  if(!scores.has('.goal'))return null;
  const parts:Vec3[][]=[];let cursor='.goal';
  while(cursor!=='.start'){const part=previous.get(cursor);if(!part)return null;parts.unshift(part.edge.points);cursor=part.id;}
  const points:Vec3[]=[];for(const point of parts.flat())if(!points.length||distance(points.at(-1)!,point)>.005)points.push(point);
  return {points,length:scores.get('.goal')!};
 }
}
