import type{Manifest}from'./types.ts';

const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const segmentDistance=(x:number,y:number,a:readonly number[],b:readonly number[])=>{const dx=b[0]!-a[0]!,dy=b[1]!-a[1]!,t=Math.max(0,Math.min(1,((x-a[0]!)*dx+(y-a[1]!)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(x-a[0]!-t*dx,y-a[1]!-t*dy);};

/** A low-frequency land-use field; routes and rotated courtyards remain authoritative. */
export function createLandscapeField(plan:Pick<Manifest,'bounds'|'landmarks'|'circulation'>,size=128){
 const data=new Uint8Array(size*size*4),[x0,y0,x1,y1]=plan.bounds;
 const sites=plan.landmarks.map(s=>({x:s.position[0],y:s.position[1],c:Math.cos(s.rotation),s:Math.sin(s.rotation),w:s.size[0]/2,d:s.size[1]/2}));
 const edges=plan.circulation.routes.flatMap(route=>route.points.slice(1).map((b,i)=>({a:route.points[i]!,b,r:route.width/2})));
 for(let j=0;j<size;j++)for(let i=0;i<size;i++){
  const x=x0+(i+.5)/size*(x1-x0),y=y1-(j+.5)/size*(y1-y0);let path=Infinity,court=Infinity;
  for(const edge of edges)path=Math.min(path,segmentDistance(x,y,edge.a,edge.b)-edge.r);
  for(const site of sites){const dx=x-site.x,dy=y-site.y;court=Math.min(court,Math.max(Math.abs(dx*site.c+dy*site.s)-site.w,Math.abs(-dx*site.s+dy*site.c)-site.d));}
  const n=(j*size+i)*4;
  data[n]=Math.round(255*smooth(.45,3.4,path)*smooth(-.15,3.5,court));
  data[n+1]=Math.round(255*(1-smooth(.0,2.5,path)));data[n+2]=Math.round(255*(1-smooth(0,4,court)));data[n+3]=255;
 }
 return{data,size};
}

/** Continuous upper-canopy variation. Roots and walking-height branches stay fixed. */
export function groveOffset(x:number,z:number,height:number):readonly[number,number,number]{
 const weight=smooth(2.2,4.8,height),patch=Math.sin(x*.093+z*.041)*Math.cos(z*.079-x*.028);
 return[.50*Math.sin(z*.11+x*.037)*weight,height*.17*patch*weight,.42*Math.cos(x*.085-z*.051)*weight];
}

