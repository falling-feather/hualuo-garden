import test from 'node:test';
import assert from 'node:assert/strict';
import { GardenCollision } from '../src/domain/collision.ts';

test('曲桥的行走面按真实四边形插值，转角外不出现隐形桥面',()=>{
  const collision=new GardenCollision({size:2,bounds:[-10,-10,10,10],heights:[-1,-1,-1,-1]},[],
    [{kind:'quad',vertices:[[-2,-3,.3],[2,-3,.3],[1,3,.9],[-1,3,.9]],routeId:'bridge'}],0);
  assert.ok(Math.abs(collision.groundHeight(0,0,.6)-.6)<1e-8);
  assert.equal(collision.blocked(1.9,2.8,.9),true);
  assert.equal(collision.blocked(0,2.8,.9),false);
});

test('跨向低处时先以当前身体高度检测栏杆，不从栏杆下方穿过去',()=>{
  const collision=new GardenCollision({size:2,bounds:[-10,-10,10,10],heights:[0,0,0,0]},
    [{center:[1,0,2.45],size:[.14,5,.9],rotation:0,kind:'railing'}],
    [{kind:'rect',center:[0,0],size:[2,5],rotation:0,height:2}],-1);
  assert.equal(collision.blocked(1.12,0,2),true);
});

test('地形双线性采样保留坡面高度', () => {
  const collision = new GardenCollision({ size: 2, bounds: [0, 0, 10, 10], heights: [0, 2, 4, 6] }, [], [], -1);
  assert.equal(collision.groundHeight(5, 5, 10), 3);
  assert.equal(collision.groundHeight(0, 0, 10), 0);
});

test('上层楼面不会把底层行走者吸到楼上', () => {
  const collision = new GardenCollision({ size: 2, bounds: [-10, -10, 10, 10], heights: [0, 0, 0, 0] }, [],
    [{ center: [0, 0], size: [5, 5], rotation: 0, height: .2 }, { center: [0, 0], size: [5, 5], rotation: 0, height: 4.5 }], -1);
  assert.equal(collision.groundHeight(0, 0, 0), .2);
  assert.equal(collision.groundHeight(0, 0, 4.4), 4.5);
});

test('墙体拦截、门洞留空，桥面允许跨水', () => {
  const terrain = { size: 2, bounds: [-10, -10, 10, 10] as [number,number,number,number], heights: [-1, -1, -1, -1] };
  const collision = new GardenCollision(terrain,
    [{ center: [3, 0, 1.5], size: [2, .4, 3], rotation: Math.PI / 2, kind: 'solid' }],
    [{ center: [0, 0], size: [2, 15], rotation: 0, height: .6 }], 0);
  assert.equal(collision.blocked(0, 0, .6), false);
  assert.equal(collision.blocked(5, 5, 0), true);
  assert.equal(collision.blocked(3, 0, .6), true);
});
