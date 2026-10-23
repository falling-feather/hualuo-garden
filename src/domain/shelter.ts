import type {Vec3} from './types.ts';

/** Highest roof surface over each horizontal cell; world coordinates use Y up. */
export class RoofShelter {
  #x:number;#z:number;#step:number;#columns:number;#rows:number;
  #heights:Float32Array;
  constructor(bounds:[number,number,number,number],step=.5){
    this.#x=bounds[0];this.#z=bounds[1];this.#step=step;
    this.#columns=Math.ceil((bounds[2]-bounds[0])/step);
    this.#rows=Math.ceil((bounds[3]-bounds[1])/step);
    this.#heights=new Float32Array(this.#columns*this.#rows).fill(-Infinity);
  }
  addTriangle(a:Vec3,b:Vec3,c:Vec3){
    const denominator=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
    if(Math.abs(denominator)<1e-8)return;
    const x0=Math.max(0,Math.floor((Math.min(a[0],b[0],c[0])-this.#x)/this.#step));
    const x1=Math.min(this.#columns-1,Math.floor((Math.max(a[0],b[0],c[0])-this.#x)/this.#step));
    const z0=Math.max(0,Math.floor((Math.min(a[2],b[2],c[2])-this.#z)/this.#step));
    const z1=Math.min(this.#rows-1,Math.floor((Math.max(a[2],b[2],c[2])-this.#z)/this.#step));
    for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){
      const px=this.#x+(x+.5)*this.#step,pz=this.#z+(z+.5)*this.#step;
      const u=((b[2]-c[2])*(px-c[0])+(c[0]-b[0])*(pz-c[2]))/denominator;
      const v=((c[2]-a[2])*(px-c[0])+(a[0]-c[0])*(pz-c[2]))/denominator;
      if(u<-.01||v<-.01||u+v>1.01)continue;
      const height=a[1]*u+b[1]*v+c[1]*(1-u-v),index=z*this.#columns+x;
      this.#heights[index]=Math.max(this.#heights[index]!,height);
    }
  }
  height(x:number,z:number){
    const column=Math.floor((x-this.#x)/this.#step),row=Math.floor((z-this.#z)/this.#step);
    if(column<0||row<0||column>=this.#columns||row>=this.#rows)return -Infinity;
    return this.#heights[row*this.#columns+column]!;
  }
  /** Finite, detached data for the GPU; uses the same X/Z cell order as height(). */
  snapshot(){
    return {
      columns:this.#columns,rows:this.#rows,
      origin:[this.#x,this.#z] as const,
      extent:[this.#columns*this.#step,this.#rows*this.#step] as const,
      heights:Float32Array.from(this.#heights,height=>Number.isFinite(height)?height:-10000),
    };
  }
}
