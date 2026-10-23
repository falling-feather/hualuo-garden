import test from 'node:test';
import assert from 'node:assert/strict';
import {NarrativeSession,canReachMemory} from '../src/domain/narrative.ts';

test('自由发现三处记忆，提前合卷不计完成，终章必须由玩家主动推进',()=>{
  const s=new NarrativeSession();
  assert.equal(s.canEnd,false);
  s.open('tea');s.next();s.close();assert.deepEqual(s.snapshot().seen,[]);
  for(const id of ['tea','painting','banquet'] as const){s.open(id);s.next();s.next();s.finish();}
  s.keepPainting('water','data:image/webp;base64,UklGRg==');s.moveTable(1);s.sitBeside();s.takeCup();s.wrapCup();
  assert.equal(s.canEnd,true);assert.equal(s.snapshot().ended,false);
  s.open('ending');s.next();s.finish();assert.equal(s.snapshot().ended,true);
});

test('未读完不能提交，重读不重复推进，重游只经显式reset',()=>{
  const s=new NarrativeSession();
  assert.throws(()=>s.open('ending'),/记忆/);
  s.open('painting');assert.throws(()=>s.finish(),/读完/);
  s.next();s.next();s.finish();s.open('painting');s.next();s.next();s.finish();
  assert.deepEqual(s.snapshot().seen,['painting']);
  const snapshot=s.snapshot();snapshot.seen.length=0;assert.equal(s.snapshot().seen.length,1);
  s.reset();assert.deepEqual(s.snapshot().seen,[]);
});

test('距离、高差与视线共同限制现场交互',()=>{
  assert.equal(canReachMemory([0,0,1.65],[2,0,0],true),true);
  assert.equal(canReachMemory([0,0,1.65],[2,0,0],false),false);
  assert.equal(canReachMemory([0,0,1.65],[5,0,0],true),false);
  assert.equal(canReachMemory([0,0,7],[1,0,0],true),false);
});
