import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,readdir,unlink,rmdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {publishGLB} from '../scripts/optimize-assets.mjs';
test('发布新模型不覆盖正在使用的旧路径，同内容复用、变更内容换地址',async()=>{
 const parent=path.resolve('tmp');
 await mkdir(parent,{recursive:true});
 const directory=await mkdtemp(path.join(parent,'asset-publication-'));
 assert.equal(path.dirname(directory),parent);
 try{
  await writeFile(path.join(directory,'garden.glb'),'currently served');
  const first=await publishGLB(directory,'garden.glb',Buffer.from('new mesh'));
  const time=(await stat(path.join(directory,first))).mtimeMs;
  assert.equal(await readFile(path.join(directory,'garden.glb'),'utf8'),'currently served');
  assert.equal(await publishGLB(directory,'garden.glb',Buffer.from('new mesh')),first);
  assert.equal((await stat(path.join(directory,first))).mtimeMs,time);
  assert.notEqual(await publishGLB(directory,'garden.glb',Buffer.from('changed mesh')),first);
 }finally{
  for(const file of await readdir(directory))await unlink(path.join(directory,file));
  await rmdir(directory);
 }
});
