import test from 'node:test';
import assert from 'node:assert/strict';
import {RouteGuide} from '../src/domain/guidance.ts';
import type {Vec3} from '../src/domain/types.ts';
test('引线沿真实连接绕行，接入路段中部，不把隔墙近路当作可走道路',()=>{
 const nodes=[{id:'a',position:[0,0,0] as Vec3},{id:'b',position:[0,10,0] as Vec3},{id:'c',position:[10,10,0] as Vec3}];
 const guide=new RouteGuide({nodes,routes:[{from:'a',to:'b',navigation:[[0,0,0],[0,10,0]]},{from:'b',to:'c',navigation:[[0,10,0],[10,10,0]]}]},[],
  (a,b)=>!(Math.min(a[0],b[0])<5&&Math.max(a[0],b[0])>5&&Math.min(a[1],b[1])<9),()=>0);
 const path=guide.plan([0,5,0],[10,10,0]);assert.ok(path);assert.ok(path.points.some(p=>p[0]===0&&p[1]===10));assert.ok(path.length<16);
});
test('找不到可通行的接入时不画穿墙引线',()=>{
 const guide=new RouteGuide({nodes:[{id:'a',position:[0,0,0]}],routes:[]},[],()=>false,()=>0);
 assert.equal(guide.plan([1,0,0],[2,0,0]),null);
});
test('外部园路通过建筑内实际可走的端口继续连通',()=>{
 const nodes=[{id:'a',position:[0,0,0] as Vec3},{id:'gate:entry',position:[0,2,0] as Vec3},{id:'gate:rear',position:[0,8,0] as Vec3},{id:'b',position:[0,30,0] as Vec3},...Array.from({length:12},(_,i)=>({id:'near'+i,position:[1+i*.1,29,0] as Vec3}))];
 const guide=new RouteGuide({nodes,routes:[{from:'a',to:'gate:entry',navigation:[[0,0,0],[0,2,0]]},{from:'gate:rear',to:'b',navigation:[[0,8,0],[0,30,0]]}]},[],(a,b)=>a[0]===0&&b[0]===0&&Math.abs(a[1]-b[1])<=6,()=>0);
 const path=guide.plan([0,0,0],[0,30,0]);assert.ok(path);assert.ok(path.points.some(p=>p[1]===8));
});
