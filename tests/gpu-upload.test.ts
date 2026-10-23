import test from'node:test';import assert from'node:assert/strict';import{BufferGeometry}from'three';
import{withMinimalUploadDraw}from'../src/scene/gpu-upload.ts';
test('几何预热只提交一个图元，实际可见范围随后完整恢复',()=>{
 const geometry=new BufferGeometry();geometry.setDrawRange(6,300000);
 withMinimalUploadDraw(geometry,()=>assert.deepEqual(geometry.drawRange,{start:6,count:3}));
 assert.deepEqual(geometry.drawRange,{start:6,count:300000});
});
test('默认无限范围及预热失败都不改变后续正式绘制',()=>{
 const geometry=new BufferGeometry();
 assert.throws(()=>withMinimalUploadDraw(geometry,()=>{throw new Error('upload');}),/upload/);
 assert.deepEqual(geometry.drawRange,{start:0,count:Infinity});
});
