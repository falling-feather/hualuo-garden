import type*as THREE from'three';

/** The broadleaf beside Qinfang, located from the existing exported trunk roots.
 * It is a local canopy study, not a replacement forest or a solid crown proxy. */
export const REPRESENTATIVE_GROVE={anchor:[-1.223,-40.107] as const,radius:3.25,maxDisplacement:.10};
const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};

export function refineRepresentativeCrown(geometry:THREE.BufferGeometry){
 const position=geometry.getAttribute('position'),uv=geometry.getAttribute('uv'),index=geometry.index;
 if(!position||!uv||!index)throw new Error('林叶样机需要完整位置、UV和索引');
 const[cx,cy]=REPRESENTATIVE_GROVE.anchor,cz=-cy,reach=REPRESENTATIVE_GROVE.radius+.4;
 geometry.computeBoundingBox();const bounds=geometry.boundingBox!;
 if(bounds.max.x<cx-reach||bounds.min.x>cx+reach||bounds.max.z<cz-reach||bounds.min.z>cz+reach)return{leaves:0,maxDisplacement:0};
 const parent=new Int32Array(position.count).fill(-1);
 const find=(v:number):number=>{if(parent[v]===-1)parent[v]=v;while(parent[v]!==v){parent[v]=parent[parent[v]!]!;v=parent[v]!;}return v;};
 const relevant:number[]=[];
 for(let i=0;i<index.count;i+=3){
  const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);
  if(Math.abs(position.getX(a)-cx)>reach||Math.abs(position.getZ(a)-cz)>reach)continue;
  const root=find(a);parent[find(b)]=root;parent[find(c)]=root;relevant.push(i);
 }
 const groups=new Map<number,{vertices:Set<number>;triangles:number}>();
 for(const i of relevant){const a=index.getX(i),root=find(a),group=groups.get(root)??{vertices:new Set<number>(),triangles:0};group.triangles++;group.vertices.add(a);group.vertices.add(index.getX(i+1));group.vertices.add(index.getX(i+2));groups.set(root,group);}
 let leaves=0,maxDisplacement=0;
 for(const group of groups.values()){
  // Tile borders can cut a lamina. Keep those parts unchanged rather than tear
  // a leaf across two separately loaded geometries.
  if(group.vertices.size!==7||group.triangles!==6)continue;
  let base=-1,tip=-1,minV=Infinity,maxV=-Infinity;
  for(const i of group.vertices){const v=uv.getY(i);if(v<minV){minV=v;base=i;}if(v>maxV){maxV=v;tip=i;}}
  if(minV>.02||maxV<.98)continue;
  const x=position.getX(base),y=position.getY(base),z=position.getZ(base),distance=Math.hypot(x-cx,z-cz),weight=1-smooth(2,REPRESENTATIVE_GROVE.radius,distance);
  if(weight<=0)continue;
  let dx=position.getX(tip)-x,dy=position.getY(tip)-y,dz=position.getZ(tip)-z;const length=Math.hypot(dx,dy,dz);if(length<.02)continue;dx/=length;dy/=length;dz/=length;
  const cluster=.5+.5*Math.sin(x*.95+z*.63)*Math.cos(z*.81-x*.37),longScale=1+weight*(.10+.30*cluster),acrossScale=1+weight*(.40+cluster);
  const moves:Array<[number,number,number,number]>=[];let peak=0;
  for(const i of group.vertices){const px=position.getX(i)-x,py=position.getY(i)-y,pz=position.getZ(i)-z,along=px*dx+py*dy+pz*dz;
   const mx=px*(acrossScale-1)+dx*along*(longScale-acrossScale),my=py*(acrossScale-1)+dy*along*(longScale-acrossScale),mz=pz*(acrossScale-1)+dz*along*(longScale-acrossScale);
   peak=Math.max(peak,Math.hypot(mx,my,mz));moves.push([i,mx,my,mz]);
  }
  const cap=Math.min(1,REPRESENTATIVE_GROVE.maxDisplacement/Math.max(peak,1e-9));
  for(const[i,mx,my,mz]of moves)position.setXYZ(i,position.getX(i)+mx*cap,position.getY(i)+my*cap,position.getZ(i)+mz*cap);
  maxDisplacement=Math.max(maxDisplacement,peak*cap);leaves++;
 }
 if(leaves)position.needsUpdate=true;
 return{leaves,maxDisplacement};
}
