import test from 'node:test';
import assert from 'node:assert/strict';
import {NarrativeSession} from '../src/domain/narrative.ts';
import {experienceText} from '../src/domain/journey.ts';
const image='data:image/webp;base64,UklGRg==';
function read(session:NarrativeSession,id:'painting'|'banquet'|'tea'){session.open(id);session.next();session.next();session.finish();}

test('阅读与行动分别保留，三种实际经历才解锁主动回望',()=>{
  const session=new NarrativeSession();
  for(const id of ['tea','painting','banquet'] as const)read(session,id);
  assert.equal(session.canEnd,false);assert.equal(session.snapshot().seen.length,3);
  assert.deepEqual(session.snapshot().completed,[]);
  session.keepPainting('path',image);session.moveTable(.45);assert.equal(session.canEnd,false);
  session.moveTable(1);session.sitBeside();session.takeCup();assert.equal(session.canEnd,false);
  session.wrapCup();assert.equal(session.canEnd,true);
  session.open('ending');session.next();session.finish();
  assert.equal(session.snapshot().ended,true);
  assert.match(experienceText('painting',session.snapshot().actions,true),/来时曲径/);
  assert.match(experienceText('tea',session.snapshot().actions,true),/两种价值/);
});

test('未读、未携杯和非法输入不能伪造经历；雪后不改写经历',()=>{
  const session=new NarrativeSession();
  assert.throws(()=>session.keepPainting('water',image),/原文/);
  read(session,'tea');assert.throws(()=>session.wrapCup(),/接过/);
  read(session,'banquet');assert.throws(()=>session.moveTable(NaN),/距离/);
  assert.throws(()=>session.moveTable(2),/距离/);
  read(session,'painting');assert.throws(()=>session.keepPainting('water','https://example.com/a'),/画笺/);
  session.keepPainting('water',image);session.moveTable(1);session.sitBeside();session.takeCup();session.wrapCup();
  session.open('ending');session.next();session.finish();
  assert.throws(()=>session.keepPainting('path',image),/雪后/);
  const view=session.snapshot();view.actions.table=0;assert.equal(session.snapshot().actions.table,1);
});

test('合页不丢未完成书签，明确重读从头，重新游园才清空',()=>{
  const session=new NarrativeSession();session.open('tea');session.next();session.close();
  session.open('tea');assert.equal(session.snapshot().page,1);session.next();session.finish();
  session.open('tea');assert.equal(session.snapshot().page,0);
  session.close();session.reset();assert.deepEqual(session.snapshot().actions,{painting:null,table:0,beside:false,cup:'waiting'});
  assert.deepEqual(session.snapshot().bookmarks,{});
});
