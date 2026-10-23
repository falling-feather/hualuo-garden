import type {Vec3}from'./types.ts';
export interface ViewCheckpoint {eye:Vec3;direction:Vec3;mode:'walk'|'orbit';landmark:string|null}
const vector=(v:unknown):v is Vec3=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
export function isViewCheckpoint(value:unknown):value is ViewCheckpoint{
 if(!value||typeof value!=='object')return false;const v=value as ViewCheckpoint;
 return vector(v.eye)&&vector(v.direction)&&Math.abs(Math.hypot(...v.direction)-1)<=.02&&['walk','orbit'].includes(v.mode)&&(v.landmark===null||typeof v.landmark==='string');
}
export function viewWithinBounds(v:ViewCheckpoint,bounds:readonly number[]){
 return v.eye[0]>=bounds[0]!-450&&v.eye[0]<=bounds[2]!+450&&v.eye[1]>=bounds[1]!-450&&v.eye[1]<=bounds[3]!+450&&v.eye[2]>=-10&&v.eye[2]<=600;
}
