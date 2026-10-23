import test from 'node:test';
import assert from 'node:assert/strict';
import {RoofShelter} from '../src/domain/shelter.ts';

test('屋面纹理快照与世界网格同向，空白区使用有限值',()=>{
  const shelter=new RoofShelter([-2,-3,2,1],1);
  shelter.addTriangle([-2,4,-3],[0,4,-3],[-2,4,-1]);
  const grid=shelter.snapshot();
  assert.deepEqual(grid.origin,[-2,-3]);assert.deepEqual(grid.extent,[4,4]);
  assert.equal(grid.columns,4);assert.equal(grid.rows,4);
  assert.equal(grid.heights[0],shelter.height(-1.5,-2.5));
  assert.equal(grid.heights[15],-10000);
  assert.ok([...grid.heights].every(Number.isFinite));
});

test('渲染快照不会修改粒子使用的屋面数据，后续屋面会进入新快照',()=>{
  const shelter=new RoofShelter([0,0,2,2],1);
  const before=shelter.snapshot();before.heights[0]=999;
  assert.equal(shelter.height(.5,.5),-Infinity);
  shelter.addTriangle([0,3,0],[2,3,0],[0,3,2]);
  assert.equal(shelter.snapshot().heights[0],3);
});

test('屋面遮挡采样保留斜面高度，露天位置不受遮挡',()=>{
  const shelter=new RoofShelter([-4,-4,4,4],.5);
  shelter.addTriangle([-2,2,-2],[2,4,-2],[-2,2,2]);
  assert.ok(Math.abs(shelter.height(-1.25,-1.25)-2.375)<.001);
  assert.equal(shelter.height(3,3),-Infinity);
  assert.equal(shelter.height(10,10),-Infinity);
});

test('重叠屋面使用最高遮挡高度，垂直面不产生整块错误屋顶',()=>{
  const shelter=new RoofShelter([-4,-4,4,4],.5);
  shelter.addTriangle([-2,2,-2],[2,2,-2],[-2,2,2]);
  shelter.addTriangle([-2,6,-2],[2,6,-2],[-2,6,2]);
  shelter.addTriangle([3,0,0],[3,6,0],[3,6,3]);
  assert.equal(shelter.height(-1,-1),6);
  assert.equal(shelter.height(3,1),-Infinity);
});
