import test from 'node:test';
import assert from 'node:assert/strict';
import {Interactions} from '../src/domain/interactions.ts';

test('旧的注销函数不会移除后来同名注册的交互',()=>{
  const registry=new Interactions();
  const item={id:'poem',landmarkId:'xiaoxiang',label:'诗笺',position:[0,1,0] as [number,number,number],kind:'reading' as const};
  const remove=registry.register(item);
  remove();registry.register(item);remove();
  assert.equal(registry.list().length,1);
});

test('异步行为完成后才广播交互；失败时不广播成功事件',async()=>{
  const registry=new Interactions();const order:string[]=[];
  registry.addEventListener('interact',()=>order.push('event'));
  registry.register({id:'ok',landmarkId:'xiaoxiang',label:'诗笺',position:[0,1,0],kind:'reading',onActivate:async()=>{await Promise.resolve();order.push('action');}});
  await registry.activate('ok');assert.deepEqual(order,['action','event']);
  registry.register({id:'fail',landmarkId:'xiaoxiang',label:'诗笺',position:[0,1,0],kind:'reading',onActivate:()=>{throw new Error('内容尚未加载');}});
  await assert.rejects(registry.activate('fail'),/内容尚未加载/);
  assert.deepEqual(order,['action','event']);
});
