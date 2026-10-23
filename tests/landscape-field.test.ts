import test from'node:test';import assert from'node:assert/strict';
import{createLandscapeField,groveOffset}from'../src/domain/landscape.ts';

test('林地分区避开实际通路及旋转院落，保持连续低频过渡',()=>{
 const plan={bounds:[-20,-20,20,20] as[number,number,number,number],landmarks:[{position:[10,0,0],size:[12,4],rotation:Math.PI/2}],circulation:{routes:[{width:4,points:[[-20,-10,0],[20,-10,0]]}]}};
 const field=createLandscapeField(plan as never,80),at=(x:number,y:number)=>field.data[(Math.floor((20-y)/40*80)*80+Math.floor((x+20)/40*80))*4]!;
 assert.equal(at(0,-10),0);assert.equal(at(10,4),0);assert.ok(at(-10,10)>250);assert.ok(at(0,-6)<at(0,0));
});

test('树冠尺度变化不移动根和人行高度，不产生不连续接缝',()=>{
 assert.deepEqual(groveOffset(15,20,2.2),[0,0,0]);
 const a=groveOffset(15,20,7),b=groveOffset(15.001,20,7);assert.ok(Math.hypot(...a.map((n,i)=>n-b[i]!))<.002);assert.ok(Math.abs(a[1])<=7*.17);assert.ok(Math.abs(a[0])<=.5&&Math.abs(a[2])<=.42);
});
