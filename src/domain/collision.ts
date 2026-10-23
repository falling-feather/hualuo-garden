import type { Collider, Terrain, WalkSurface,Vec3 } from './types.ts';

function triangleHeight(x:number,y:number,a:Vec3,b:Vec3,c:Vec3){
  const denominator=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
  if(Math.abs(denominator)<1e-10)return null;
  const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/denominator;
  const v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/denominator;
  if(u<-.00001||v<-.00001||u+v>1.00001)return null;
  return a[2]*u+b[2]*v+c[2]*(1-u-v);
}
function insertCells<T>(map:Map<string,T[]>,bounds:number[],item:T){
  for(let x=Math.floor(bounds[0]!/8);x<=Math.floor(bounds[2]!/8);x++)for(let y=Math.floor(bounds[1]!/8);y<=Math.floor(bounds[3]!/8);y++){
    const key=x+','+y,cell=map.get(key)??[];cell.push(item);map.set(key,cell);
  }
}

function localPoint(x: number, y: number, cx: number, cy: number, rotation: number) {
  const c = Math.cos(rotation), s = Math.sin(rotation);
  return [(x - cx) * c + (y - cy) * s, -(x - cx) * s + (y - cy) * c] as const;
}

export class GardenCollision {
  #terrain: Terrain;
  #surfaceCells=new Map<string,WalkSurface[]>();
  #water: number;
  #cells = new Map<string, Collider[]>();
  constructor(terrain: Terrain, colliders: Collider[], surfaces: WalkSurface[], waterLevel: number) {
    if (terrain.size < 2 || terrain.heights.length !== terrain.size ** 2) throw new RangeError('地形网格不完整');
    this.#terrain = terrain;
    this.#water = waterLevel;
    for (const item of colliders)this.addCollider(item);
    for(const surface of surfaces){
      if(surface.kind==='quad'){
        insertCells(this.#surfaceCells,[Math.min(...surface.vertices.map(p=>p[0])),Math.min(...surface.vertices.map(p=>p[1])),Math.max(...surface.vertices.map(p=>p[0])),Math.max(...surface.vertices.map(p=>p[1]))],surface);
      }else{
        const c=Math.abs(Math.cos(surface.rotation)),s=Math.abs(Math.sin(surface.rotation));
        const dx=(surface.size[0]*c+surface.size[1]*s)/2,dy=(surface.size[0]*s+surface.size[1]*c)/2;
        insertCells(this.#surfaceCells,[surface.center[0]-dx,surface.center[1]-dy,surface.center[0]+dx,surface.center[1]+dy],surface);
      }
    }
  }
  addCollider(item:Collider){
    const a=Math.abs(Math.cos(item.rotation)),b=Math.abs(Math.sin(item.rotation));
    const dx=(item.size[0]*a+item.size[1]*b)/2+.4,dy=(item.size[0]*b+item.size[1]*a)/2+.4;
    const keys:string[]=[];
    for(let x=Math.floor((item.center[0]-dx)/8);x<=Math.floor((item.center[0]+dx)/8);x++)for(let y=Math.floor((item.center[1]-dy)/8);y<=Math.floor((item.center[1]+dy)/8);y++){
      const key=x+','+y,cell=this.#cells.get(key)??[];cell.push(item);this.#cells.set(key,cell);keys.push(key);
    }
    let live=true;return ()=>{if(!live)return;live=false;for(const key of keys){const cell=this.#cells.get(key);if(!cell)continue;const i=cell.indexOf(item);if(i>=0)cell.splice(i,1);if(!cell.length)this.#cells.delete(key);}};
  }
  terrainHeight(x: number, y: number) {
    const { bounds: [x0, y0, x1, y1], size: n, heights: h } = this.#terrain;
    const u = Math.max(0, Math.min(n - 1.000001, (x - x0) / (x1 - x0) * (n - 1)));
    const v = Math.max(0, Math.min(n - 1.000001, (y - y0) / (y1 - y0) * (n - 1)));
    const i = Math.floor(u), j = Math.floor(v), a = u - i, b = v - j;
    return (h[j * n + i]! * (1 - a) + h[j * n + i + 1]! * a) * (1 - b)
      + (h[(j + 1) * n + i]! * (1 - a) + h[(j + 1) * n + i + 1]! * a) * b;
  }
  groundHeight(x: number, y: number, referenceHeight: number) {
    let height = this.terrainHeight(x, y);
    for (const surface of this.#surfaceCells.get(Math.floor(x/8)+','+Math.floor(y/8))??[]) {
      let candidate:number|null=null;
      if(surface.kind==='quad'){
        const [a,b,c,d]=surface.vertices;
        candidate=triangleHeight(x,y,a,b,c)??triangleHeight(x,y,a,c,d);
      }else{
        const [lx,ly]=localPoint(x,y,...surface.center,surface.rotation);
        if(Math.abs(lx)<=surface.size[0]/2&&Math.abs(ly)<=surface.size[1]/2)candidate=surface.height;
      }
      if(candidate!==null&&candidate<=referenceHeight+.38&&candidate>=height)height=candidate;
    }
    return height;
  }
  blocked(x: number, y: number, feet: number, radius = .24) {
    const [x0, y0, x1, y1] = this.#terrain.bounds;
    if (x < x0 + 1 || y < y0 + 1 || x > x1 - 1 || y > y1 - 1) return true;
    const height = this.groundHeight(x, y, feet);
    if (height < this.#water - .12 || height > feet + .40) return true;
    const cell = this.#cells.get(Math.floor(x / 8) + ',' + Math.floor(y / 8)) ?? [];
    const bodyHeight=Math.max(feet,height);
    for (const box of cell) {
      if (box.center[2] + box.size[2] / 2 < bodyHeight + .20 || box.center[2] - box.size[2] / 2 > bodyHeight + 1.65) continue;
      const [lx, ly] = localPoint(x, y, box.center[0], box.center[1], box.rotation);
      if (Math.abs(lx) < box.size[0] / 2 + radius && Math.abs(ly) < box.size[1] / 2 + radius) return true;
    }
    return false;
  }
  canWalkSegment(a:Vec3,b:Vec3){
    const n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.20));let feet=a[2];
    for(let i=0;i<=n;i++){
      const t=i/n,x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t;
      if(this.blocked(x,y,feet))return false;feet=this.groundHeight(x,y,feet);
    }
    return Math.abs(feet-b[2])<.65;
  }
  lineOfSight(a:Vec3,b:Vec3) {
    const margin=Math.min(.01,.01/Math.max(.01,Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2])));
    const candidates=new Set<Collider>();
    for(let x=Math.floor(Math.min(a[0],b[0])/8);x<=Math.floor(Math.max(a[0],b[0])/8);x++)for(let y=Math.floor(Math.min(a[1],b[1])/8);y<=Math.floor(Math.max(a[1],b[1])/8);y++)for(const box of this.#cells.get(x+','+y)??[])candidates.add(box);
    for(const box of candidates){
      const p=localPoint(a[0],a[1],box.center[0],box.center[1],box.rotation),q=localPoint(b[0],b[1],box.center[0],box.center[1],box.rotation);
      const start=[...p,a[2]-box.center[2]],end=[...q,b[2]-box.center[2]];
      // A centimetre at each end, never a percentage of a distant sight line.
      let near=margin,far=1-margin;
      for(let axis=0;axis<3&&near<=far;axis++){
        const delta=end[axis]!-start[axis]!,half=box.size[axis]!/2;
        if(Math.abs(delta)<1e-9){if(Math.abs(start[axis]!)>half){near=1;far=0;}continue;}
        const t0=(-half-start[axis]!)/delta,t1=(half-start[axis]!)/delta;
        near=Math.max(near,Math.min(t0,t1));far=Math.min(far,Math.max(t0,t1));
      }
      if(near<=far)return false;
    }
    const count=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.75);
    for(let i=1;i<count;i++){const t=i/count,x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t;if(a[2]+(b[2]-a[2])*t<this.terrainHeight(x,y)+.08)return false;}
    return true;
  }
}
