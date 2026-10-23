import test from'node:test';import assert from'node:assert/strict';
import{GardenCollision}from'../src/domain/collision.ts';
import{tablePosition,isOutsideCupDoor,placePoint}from'../src/domain/journey-places.ts';
test('席面使用室内行走层承托，不落到台基内部的地形上',()=>{
 const collision=new GardenCollision({size:2,bounds:[-20,-20,20,20],heights:[.35,.35,.35,.35]},[],[{center:[0,0],size:[12,8],height:1.07,rotation:0}],-2);
 const spec={position:[0,0,.45] as [number,number,number],rotation:0,views:{interior:[0,0,2.32] as [number,number,number]}};
 const p=tablePosition(spec,(x,y,z)=>collision.groundHeight(x,y,z));assert.equal(p[2],1.07);
});
test('包袱附近仍在门内时不能算送出门槛，旋转院落规则一致',()=>{
 const spec={position:[37,44,3.4] as [number,number,number],rotation:-.12,size:[21,20] as [number,number]};
 assert.equal(isOutsideCupDoor(placePoint([0,-9.9,0],spec),spec),false);
 assert.equal(isOutsideCupDoor(placePoint([0,-10.1,0],spec),spec),false);
 assert.equal(isOutsideCupDoor(placePoint([0,-10.5,0],spec),spec),true);
});
