import type {BufferGeometry}from'three';
/** Upload all attribute buffers while processing only one triangle. Never leave
 * the source geometry restricted, including when the driver's warm draw fails. */
export function withMinimalUploadDraw(geometry:BufferGeometry,draw:()=>void){
 const {start,count}=geometry.drawRange;
 try{geometry.setDrawRange(start,Math.min(3,count));draw();}
 finally{geometry.setDrawRange(start,count);}
}
