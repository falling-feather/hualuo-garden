import test from 'node:test';
import assert from 'node:assert/strict';
import {GardenCollision} from '../src/domain/collision.ts';
test('现场光点不穿墙，也不被脚下地板遮住',()=>{
 const terrain={size:2,bounds:[-10,-10,10,10] as [number,number,number,number],heights:[0,0,0,0]};
 const c=new GardenCollision(terrain,[{center:[1,0,1.5],size:[.2,3,3],rotation:.25,kind:'wall'},{center:[0,0,-.1],size:[8,8,.2],rotation:0,kind:'floor'}],[],0);
 assert.equal(c.lineOfSight([0,0,1.65],[2,0,1.4]),false);
 assert.equal(c.lineOfSight([0,0,1.65],[0,2,1.4]),true);
 assert.equal(c.lineOfSight([0,0,4],[2,0,4]),true);
});
test('远处光点附近的薄墙仍遮挡视线，端点容差不随距离放大',()=>{
 const terrain={size:2,bounds:[-100,-100,100,100] as [number,number,number,number],heights:[0,0,0,0]};
 const c=new GardenCollision(terrain,[{center:[0,-.4,1.5],size:[4,.12,3],rotation:0,kind:'wall'}],[],0);
 assert.equal(c.lineOfSight([0,-60,1.65],[0,0,1.22]),false);
});
test('游园引线逐步检验人体通行，不跨过端点之间的薄墙',()=>{
 const terrain={size:2,bounds:[-10,-10,10,10] as [number,number,number,number],heights:[0,0,0,0]};
 const c=new GardenCollision(terrain,[{center:[1,0,1],size:[.1,2,2],rotation:0,kind:'wall'}],[],0);
 assert.equal(c.canWalkSegment([0,0,0],[2,0,0]),false);
 assert.equal(c.canWalkSegment([0,0,0],[0,3,0]),true);
});
