import * as THREE from 'three';
import type {MemoryId} from '../domain/narrative.ts';
import {createTeaVessel} from './journey-props.ts';

// Small, non-solid memory objects float above a path; they are stage symbols,
// never extra furniture across an already validated walking route.
export function createMemoryToken(id:MemoryId){
  const group=new THREE.Group();
  const paper=new THREE.MeshStandardMaterial({color:'#f2dfaf',roughness:.87,side:THREE.DoubleSide});
  const wood=new THREE.MeshStandardMaterial({color:'#6b3d24',roughness:.6});
  const porcelain=new THREE.MeshStandardMaterial({color:'#dce7df',roughness:.24,metalness:.03});
  const blue=new THREE.MeshStandardMaterial({color:'#376879',roughness:.3});
  const gold=new THREE.MeshBasicMaterial({color:'#e8c985',transparent:true,opacity:.68,toneMapped:false});
  const mesh=(geometry:THREE.BufferGeometry,material:THREE.Material,x=0,y=0,z=0)=>{
    const item=new THREE.Mesh(geometry,material);item.position.set(x,y,z);group.add(item);return item;
  };
  if(id==='tea'){
    group.add(createTeaVessel());group.scale.setScalar(1.05);
  }else if(id==='banquet'){
    const plate=mesh(new THREE.LatheGeometry([[.03,0],[.13,.01],[.19,.05],[.185,.057],[.12,.025],[.03,.018]].map(([x,y])=>new THREE.Vector2(x!,y!)),32),porcelain);
    plate.rotation.z=-.12;
    const rim=mesh(new THREE.TorusGeometry(.181,.005,6,32),blue,0,.05);rim.rotation.x=Math.PI/2;
    for(const offset of [-.045,.045]){
      const chopstick=mesh(new THREE.CylinderGeometry(.009,.006,.68,8),paper,offset,.075);chopstick.rotation.z=Math.PI/2-.2;chopstick.rotation.y=.18;
    }
    const egg=mesh(new THREE.SphereGeometry(.021,14,10),porcelain,.02,.055,-.04);egg.scale.y=1.25;
    group.scale.setScalar(.85);
  }else{
    mesh(new THREE.PlaneGeometry(.38,.52,4,6),paper);
    for(const y of [-.27,.27])mesh(new THREE.CylinderGeometry(.024,.024,.47,12),wood,0,y).rotation.z=Math.PI/2;
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=384;
    const context=canvas.getContext('2d')!;
    context.clearRect(0,0,256,384);context.fillStyle='#725332';context.font='38px SimSun,serif';context.textAlign='center';
    const text=id==='ending'?'雪中回望':'画中游';[...text].forEach((letter,i)=>context.fillText(letter,128,86+i*62));
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    mesh(new THREE.PlaneGeometry(.37,.51),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}),0,0,.002);
    group.scale.setScalar(.45);
  }
  const ring=mesh(new THREE.TorusGeometry(.36,.009,6,40),gold,0,-1.15/group.scale.y);ring.rotation.x=Math.PI/2;ring.scale.setScalar(1/group.scale.y);
  return {group,ring,gold};
}
