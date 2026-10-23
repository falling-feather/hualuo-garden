import test from 'node:test';
import assert from 'node:assert/strict';
import {GardenCollision}from'../src/domain/collision.ts';
test('叙事家具的碰撞可注册和移除，不破坏既有墙体',()=>{
 const collision=new GardenCollision({size:2,bounds:[-10,-10,10,10],heights:[0,0,0,0]},[{center:[5,0,1],size:[.2,8,2],rotation:0}],[], -2);
 const remove=collision.addCollider({center:[0,0,.3],size:[1,.5,.6],rotation:.3});
 assert.equal(collision.blocked(0,0,0),true);assert.equal(collision.blocked(5,0,0),true);
 remove();remove();assert.equal(collision.blocked(0,0,0),false);assert.equal(collision.blocked(5,0,0),true);
});
