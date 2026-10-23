import test from 'node:test';
import assert from 'node:assert/strict';
import {selectDetailedLandmarks} from '../src/domain/detail-budget.ts';

test('靠近未选中的相邻院落也能显示精模；远处、镜头外院落不抢预算',()=>{
  const chosen=selectDetailedLandmarks([
    {id:'near',distance:7,inView:true},
    {id:'far',distance:120,inView:true},
    {id:'behind',distance:2,inView:false},
  ],null,new Set());
  assert.deepEqual([...chosen],['near']);
});

test('选中院落优先，近景精模同时显示最多两座',()=>{
  const chosen=selectDetailedLandmarks([
    {id:'a',distance:4,inView:true},{id:'b',distance:5,inView:true},
    {id:'selected',distance:52,inView:true},
  ],'selected',new Set());
  assert.deepEqual([...chosen],['selected','a']);
});

test('距离阈值保留迟滞，避免边缘往返时反复切换；全园鸟瞰使用基础层',()=>{
  const edge=[{id:'edge',distance:23,inView:true}];
  assert.equal(selectDetailedLandmarks(edge,null,new Set()).size,0);
  assert.equal(selectDetailedLandmarks(edge,null,new Set(['edge'])).size,1);
  assert.equal(selectDetailedLandmarks([{id:'edge',distance:29,inView:true}],null,new Set(['edge'])).size,0);
  assert.equal(selectDetailedLandmarks([{id:'selected',distance:130,inView:true}],'selected',new Set()).size,0);
});
