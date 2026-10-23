import * as THREE from 'three';
import {TABLE_LARGE,TABLE_SMALL} from '../domain/journey-places.ts';

function roundedBoard(width:number,depth:number,thickness:number){
 const s=new THREE.Shape(),x=-width/2,y=-depth/2,r=.018;
 s.moveTo(x+r,y);s.lineTo(x+width-r,y);s.quadraticCurveTo(x+width,y,x+width,y+r);s.lineTo(x+width,y+depth-r);s.quadraticCurveTo(x+width,y+depth,x+width-r,y+depth);s.lineTo(x+r,y+depth);s.quadraticCurveTo(x,y+depth,x,y+depth-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);
 const geometry=new THREE.ExtrudeGeometry(s,{depth:thickness,bevelEnabled:true,bevelSize:.004,bevelThickness:.004,bevelSegments:2,steps:1,curveSegments:4});geometry.rotateX(-Math.PI/2);return geometry;
}
export function createTeaVessel(){
 const group=new THREE.Group(),canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
 const c=canvas.getContext('2d')!;c.fillStyle='#dfe5d9';c.fillRect(0,0,512,256);c.strokeStyle='#406781';c.lineWidth=1.7;
 for(let j=0;j<7;j++){const x=34+j*73,y=136+(j%2)*12;c.strokeStyle='#4b785a';c.beginPath();c.moveTo(x-20,232);c.bezierCurveTo(x+5,190,x-8,168,x,y);c.stroke();for(let k=0;k<5;k++){const a=k*Math.PI*.4;c.fillStyle=j%2?'#b95946':'#b99b50';c.strokeStyle='#496c91';c.beginPath();c.ellipse(x+Math.cos(a)*9,y+Math.sin(a)*9,8,4,a,0,Math.PI*2);c.fill();c.stroke();}}
 c.lineWidth=3;for(const y of [18,29,225]){c.beginPath();c.moveTo(0,y);c.lineTo(512,y);c.stroke();}
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 const porcelain=new THREE.MeshPhysicalMaterial({color:'#edf1e5',map:texture,roughness:.26,clearcoat:.45,clearcoatRoughness:.18,side:THREE.DoubleSide});
 const profile=[[.021,0],[.032,.006],[.034,.018],[.042,.029],[.063,.094],[.065,.103],[.061,.105],[.058,.094],[.038,.033],[.026,.020],[.02,.019]].map(([x,y])=>new THREE.Vector2(x!,y!));
 const bowl=new THREE.Mesh(new THREE.LatheGeometry(profile,48),porcelain);bowl.castShadow=bowl.receiveShadow=true;group.add(bowl);
 const rim=new THREE.Mesh(new THREE.TorusGeometry(.063,.0014,6,48),new THREE.MeshStandardMaterial({color:'#31566c',roughness:.28}));rim.rotation.x=Math.PI/2;rim.position.y=.102;group.add(rim);
 // The text specifies a Cheng-kiln five-colour covered cup. This is an authored
 // form based on those features, not a measured reproduction of an antique.
 const lid=new THREE.Mesh(new THREE.LatheGeometry([[.008,.015],[.016,.013],[.035,.011],[.059,.002],[.066,0],[.066,-.004],[.058,-.003]].map(([x,y])=>new THREE.Vector2(x!,y!)),48),porcelain);lid.position.y=.108;group.add(lid);
 const knob=new THREE.Mesh(new THREE.LatheGeometry([[.007,0],[.01,.004],[.011,.009],[.006,.014],[0,.014]].map(([x,y])=>new THREE.Vector2(x!,y!)),24),porcelain);knob.position.y=.12;group.add(knob);
 return group;
}
export function createTable(width:number,depth:number,height:number,material:THREE.MeshStandardMaterial){
 const group=new THREE.Group();
 const add=(geometry:THREE.BufferGeometry,x:number,y:number,z:number)=>{const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;group.add(m);return m;};
 add(roundedBoard(width,depth,.033),0,height-.033,0);
 for(const x of [-1,1])for(const z of [-1,1]){const leg=add(new THREE.CylinderGeometry(.027,.019,height-.06,4),x*(width/2-.06),(height-.06)/2,z*(depth/2-.05));leg.rotation.y=Math.PI/4;}
 for(const z of [-1,1])add(new THREE.BoxGeometry(width-.08,.073,.023),0,height-.1,z*(depth/2-.046));
 for(const x of [-1,1])add(new THREE.BoxGeometry(.023,.073,depth-.08),x*(width/2-.046),height-.1,0);
 return group;
}
export function createBanquetProps(wood:THREE.MeshStandardMaterial){
 const group=new THREE.Group(),large=createTable(...TABLE_LARGE.size,wood),small=createTable(...TABLE_SMALL.size,wood);
 large.position.x=TABLE_LARGE.x;group.add(large,small);
 const dish=new THREE.Mesh(new THREE.LatheGeometry([[.03,0],[.09,.004],[.12,.025],[.116,.031],[.07,.012],[.03,.009]].map(([x,y])=>new THREE.Vector2(x!,y!)),32),new THREE.MeshPhysicalMaterial({color:'#e9e5cc',roughness:.28,clearcoat:.4}));dish.position.set(0,.535,0);small.add(dish);
 const egg=new THREE.Mesh(new THREE.SphereGeometry(.014,18,12),new THREE.MeshStandardMaterial({color:'#f0e4c4',roughness:.7}));egg.scale.y=1.3;egg.position.set(.012,.558,.005);small.add(egg);
 const ivory=new THREE.MeshStandardMaterial({color:'#e0cc9a',roughness:.46});
 for(const z of [-.028,.028]){const stick=new THREE.Mesh(new THREE.CylinderGeometry(.0045,.0028,.34,10),ivory);stick.rotation.z=Math.PI/2;stick.rotation.y=.16;stick.position.set(.02,.568,z);small.add(stick);}
 const silver=new THREE.MeshStandardMaterial({color:'#b8bdb6',roughness:.35,metalness:.78});for(const z of [-.028,.028]){const cap=new THREE.Mesh(new THREE.CylinderGeometry(.0046,.0046,.019,10),silver);cap.rotation.z=Math.PI/2;cap.position.set(-.142,.568,z+.025);small.add(cap);}
 const cup=createTeaVessel();cup.position.set(.8,.724,.025);group.add(cup);
 return {group,small};
}
export function createCupBundle(material:THREE.MeshStandardMaterial){
 const group=new THREE.Group(),cloth=new THREE.PlaneGeometry(.43,.38,14,14);cloth.rotateX(-Math.PI/2);
 const p=cloth.attributes.position!;for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i);p.setY(i,.016+.014*Math.sin(x*38+z*12)*Math.cos(z*25)+.012*Math.exp(-(x*x+z*z)*25));}cloth.computeVertexNormals();
 const fabric=new THREE.Mesh(cloth,material);fabric.receiveShadow=true;group.add(fabric);
 const cup=createTeaVessel();cup.position.y=.04;group.add(cup);
 const knot=new THREE.Mesh(new THREE.TorusKnotGeometry(.032,.008,32,6,2,3),material);knot.rotation.x=Math.PI/2;knot.position.y=.12;knot.visible=false;group.add(knot);
 const profile=[[.05,.008],[.09,.025],[.104,.07],[.09,.125],[.033,.166],[.027,.178],[.06,.205],[.052,.214]].map(([x,y])=>new THREE.Vector2(x!,y!));
 const wrapped=new THREE.Mesh(new THREE.LatheGeometry(profile,40),material),wp=wrapped.geometry.attributes.position!;
 for(let i=0;i<wp.count;i++){const x=wp.getX(i),z=wp.getZ(i),y=wp.getY(i),a=Math.atan2(z,x),fold=1+.10*Math.sin(a*9+y*18)*Math.sin(y*16);wp.setXYZ(i,x*fold,y,z*fold);}wrapped.geometry.computeVertexNormals();wrapped.castShadow=wrapped.receiveShadow=true;wrapped.visible=false;group.add(wrapped);knot.position.y=.174;
 return {group,cup,knot,wrapped};
}
