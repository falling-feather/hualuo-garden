import type {Landmark,Vec3} from './types.ts';
// Original events are documented separately; these local staging positions
// are authored additions seated on the existing terrain and walking surfaces.
export const CUP_PICKUP:Vec3=[0,-3.3,0];
export const CUP_DELIVERY:Vec3=[0,-11.3,0];
export const CUP_RETURN_VIEW={eye:[.8,-12.6,2.2] as Vec3,look:[0,-9.5,1.4] as Vec3};
export const TABLE_STAGE:Vec3=[-1.9,-.4,0];
export const TABLE_LARGE={x:.8,size:[1.1,.62,.72] as Vec3};
export const TABLE_SMALL={start:-1.5,end:-.4,size:[.72,.46,.53] as Vec3};
export function placePoint(local:Vec3,spec:Pick<Landmark,'position'|'rotation'>):Vec3{
 const c=Math.cos(spec.rotation),s=Math.sin(spec.rotation);
 return [spec.position[0]+local[0]*c-local[1]*s,spec.position[1]+local[0]*s+local[1]*c,spec.position[2]+local[2]];
}
export function tablePosition(spec:Pick<Landmark,'position'|'rotation'> & {views:{interior:Vec3}},groundHeight:(x:number,y:number,reference:number)=>number):Vec3{
 const p=placePoint(TABLE_STAGE,spec);p[2]=groundHeight(p[0],p[1],spec.position[2]+spec.views.interior[2]-1.65);return p;
}
export function isOutsideCupDoor(point:Vec3,spec:Pick<Landmark,'position'|'rotation'|'size'>){
 const x=point[0]-spec.position[0],y=point[1]-spec.position[1],localY=-x*Math.sin(spec.rotation)+y*Math.cos(spec.rotation);
 return localY<-spec.size[1]/2-.28;
}
