import test from 'node:test';
import assert from 'node:assert/strict';
import {NarrativeSession} from '../src/domain/narrative.ts';
import {GardenSaveStore,parseGardenSave,SAVE_KEY} from '../src/domain/save.ts';
import type {GardenSave} from '../src/domain/save.ts';
const bounds=[-96,-96,96,96],ids=['gate','longcui'];
function fixture():GardenSave{const session=new NarrativeSession();session.open('tea');session.next();session.next();session.finish();session.takeCup();return {schema:1,narrative:session.progress(),view:{eye:[1,2,2.15],direction:[0,1,0],mode:'walk',landmark:'longcui'},environment:{hour:9.5,season:'autumn',weather:'clear'},quality:'fine',savedAt:'2026-10-22T00:00:00Z'};}
test('刷新保留已读与手中茶杯，不把部分经历伪造为结局',()=>{
 const value=fixture(),parsed=parseGardenSave(JSON.stringify(value),ids,bounds);assert.equal(parsed.kind,'valid');
 if(parsed.kind!=='valid')throw new Error('Fixture invalid');
 const restored=new NarrativeSession(parsed.value.narrative);assert.equal(restored.snapshot().actions.cup,'carrying');assert.equal(restored.canEnd,false);
 restored.wrapCup();assert.deepEqual(restored.snapshot().completed,['tea']);
});
test('拒绝未知地点、越界方向、篡改结局和外部图像',()=>{
 for(const mutate of [(s:GardenSave)=>{s.view.landmark='missing';},(s:GardenSave)=>{s.view.direction=[0,2,0];},(s:GardenSave)=>{s.narrative.ended=true;},(s:GardenSave)=>{s.narrative.actions.painting={subject:'water',image:'https://example.com/a.jpg'};}]){const s=fixture();mutate(s);assert.equal(parseGardenSave(JSON.stringify(s),ids,bounds).kind,'invalid');}
 assert.equal(parseGardenSave('{',ids,bounds).kind,'invalid');assert.equal(parseGardenSave('{"schema":9}',ids,bounds).kind,'unsupported');
});
test('错误或新格式原记录不被自动覆盖；写入失败不破坏好记录',()=>{
 const map=new Map([[SAVE_KEY,'{"schema":9}']]),storage={getItem:(key:string)=>map.get(key)??null,setItem:(key:string,value:string)=>{map.set(key,value);},removeItem:(key:string)=>{map.delete(key);}};
 const store=new GardenSaveStore(storage);store.load(ids,bounds);assert(store.write(fixture()));assert.equal(map.get(SAVE_KEY),'{"schema":9}');
 store.clear();assert.equal(store.write(fixture()),null);const good=map.get(SAVE_KEY);
 const full=new GardenSaveStore({...storage,setItem:()=>{throw new Error('Quota');}});full.load(ids,bounds);assert(full.write(fixture()));assert.equal(map.get(SAVE_KEY),good);
});
test('新画笺可保留取景位姿，旧画笺继续有效且不伪造位置',()=>{
 const session=new NarrativeSession();session.open('painting');session.next();session.next();session.finish();
 const image='data:image/webp;base64,UklGRg==',view={eye:[-13,-47,2.4] as [number,number,number],direction:[0,1,0] as [number,number,number],mode:'walk' as const,landmark:'qinfang'};
 session.keepPainting('water',image,view);view.eye[0]=90;
 assert.equal(session.snapshot().actions.painting?.view?.eye[0],-13);
 const save=fixture();save.narrative=session.progress();assert.equal(parseGardenSave(JSON.stringify(save),[...ids,'qinfang'],bounds).kind,'valid');
 const legacy=new NarrativeSession();legacy.open('painting');legacy.next();legacy.next();legacy.finish();legacy.keepPainting('path',image);save.narrative=legacy.progress();
 const parsed=parseGardenSave(JSON.stringify(save),ids,bounds);assert.equal(parsed.kind,'valid');if(parsed.kind==='valid')assert.equal(parsed.value.narrative.actions.painting?.view,undefined);
});
test('坏的新增取景位姿不会覆盖已有画笺，也不能混入存档',()=>{
 const session=new NarrativeSession();session.open('painting');session.next();session.next();session.finish();session.keepPainting('water','data:image/webp;base64,UklGRg==');
 assert.throws(()=>session.keepPainting('path','data:image/webp;base64,UklGRg==',{eye:[0,0,2],direction:[0,0,0],mode:'walk',landmark:'qinfang'}),/取景/);
 assert.equal(session.snapshot().actions.painting?.subject,'water');
 const s=fixture();s.narrative=session.progress();s.narrative.actions.painting!.view={eye:[0,0,2],direction:[0,0,1],mode:'walk',landmark:'missing'};
 assert.equal(parseGardenSave(JSON.stringify(s),ids,bounds).kind,'invalid');
});
