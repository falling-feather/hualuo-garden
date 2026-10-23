import test from'node:test';import assert from'node:assert/strict';import*as THREE from'three';
import{refineRepresentativeCrown,REPRESENTATIVE_GROVE}from'../src/scene/foliage-study.ts';

function leaf(x:number,z:number){
 const geometry=new THREE.BufferGeometry();
 const points=[[0,0],[.28,-.9],[.71,-.74],[1,0],[.71,.74],[.28,.9],[.49,0]];
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(points.flatMap(([t,s])=>[x+t*.16,4+s*.05,z]),3));
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute(points.flatMap(([t,s])=>[.5+s*.5,t]),2));
 geometry.setIndex(points.slice(0,6).flatMap((_,i)=>[6,i,(i+1)%6]));return geometry;
}

test('代表性冠层只调整完整叶片，叶柄、索引、UV和面数保持原样',()=>{
 const [x,y]=REPRESENTATIVE_GROVE.anchor,geometry=leaf(x,-y),before=geometry.getAttribute('position').array.slice(),uv=geometry.getAttribute('uv').array.slice(),indices=geometry.index!.array.slice();
 const result=refineRepresentativeCrown(geometry);assert.equal(result.leaves,1);assert.ok(result.maxDisplacement>0&&result.maxDisplacement<=.11);
 assert.deepEqual([...geometry.getAttribute('position').array.slice(0,3)],[...before.slice(0,3)]);assert.deepEqual(geometry.index!.array,indices);assert.deepEqual(geometry.getAttribute('uv').array,uv);assert.equal(geometry.getAttribute('position').count,7);
});

test('样机范围之外、破碎叶片和缺少叶柄的分片不被改写',()=>{
 const [x,y]=REPRESENTATIVE_GROVE.anchor;
 const partial=leaf(x,-y);partial.setIndex([6,0,1,6,1,2]);
 const noBase=leaf(x,-y);const uv=noBase.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setY(i,.2+.8*uv.getY(i));
 for(const geometry of[leaf(x+12,-y),partial,noBase]){
  const before=geometry.getAttribute('position').array.slice();assert.equal(refineRepresentativeCrown(geometry).leaves,0);assert.deepEqual(geometry.getAttribute('position').array,before);
 }
});
