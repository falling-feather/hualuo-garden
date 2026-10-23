import test from'node:test';import assert from'node:assert/strict';import * as THREE from'three';
import{APRON_MAX_RISE,extendApronBounds}from'../src/scene/landscape-style.ts';
test('园外起伏保守边界在合批后仍有效，源顶点与园内地形不被改写',()=>{
 const geometry=new THREE.PlaneGeometry(1000,1000,2,2);geometry.rotateX(-Math.PI/2);
 const vertices=geometry.attributes.position.array.slice();geometry.computeBoundingBox();const oldY=geometry.boundingBox!.max.y;
 extendApronBounds(geometry);const batch=new THREE.BatchedMesh(1,geometry.attributes.position.count,geometry.index!.count,new THREE.MeshStandardMaterial());
 const id=batch.addGeometry(geometry),box=new THREE.Box3();batch.getBoundingBoxAt(id,box);
 assert(box.max.y>=oldY+APRON_MAX_RISE);assert.deepEqual([...geometry.attributes.position.array],[...vertices]);
 assert(geometry.boundingSphere!.radius>=box.getSize(new THREE.Vector3()).length()/2-.001);
 batch.dispose();geometry.dispose();
});
