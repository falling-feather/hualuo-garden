import test from 'node:test';
import assert from 'node:assert/strict';
import {Document,NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import draco3d from 'draco3d';
import {prepareDocument,splitPrimitiveByTile,triangleCount,boundsOf,packGlb,normalizedRole,removeDegenerateTriangles,serializeSharedGlb,thinWholeLeaves} from '../scripts/asset-optimizer.mjs';

function primitive(document:Document,positions:number[],indices:number[],name='stone'){
  const buffer=document.createBuffer();
  return document.createPrimitive().setMaterial(document.createMaterial(name))
    .setAttribute('POSITION',document.createAccessor('',buffer).setType('VEC3').setArray(new Float32Array(positions)))
    .setAttribute('NORMAL',document.createAccessor('',buffer).setType('VEC3').setArray(Float32Array.from({length:positions.length},(_,i)=>i%3===1?1:0)))
    .setAttribute('TEXCOORD_0',document.createAccessor('',buffer).setType('VEC2').setArray(new Float32Array(positions.length/3*2)))
    .setIndices(document.createAccessor('',buffer).setType('SCALAR').setArray(new Uint16Array(indices)));
}

test('far foliage keeps whole leaves, stays bounded and does not mutate shared near accessors',()=>{
  const doc=new Document(),positions:number[]=[],indices:number[]=[];
  for(let leaf=0;leaf<20;leaf++){
    const n=positions.length/3;positions.push(leaf,0,0,leaf+.1,0,0,leaf+.1,0,.1,leaf,0,.1);
    indices.push(n,n+1,n+2,n,n+2,n+3);
  }
  const p=primitive(doc,positions,indices),original=p.getAttribute('POSITION')!;
  const result=thinWholeLeaves(p,.4,.06);
  assert.equal(result.leavesBefore,20);assert.equal(result.leavesAfter,8);
  assert.equal(triangleCount(p),16,'No half-leaves or isolated surviving triangles');
  assert.deepEqual([...original.getArray()!],[...new Float32Array(positions)]);
  assert(result.maxDisplacement<=.06);
  const counts=new Map<number,number>();const next=p.getAttribute('POSITION')!.getArray()!;
  for(let i=0;i<next.length;i+=3){const leaf=Math.round(next[i]!);counts.set(leaf,(counts.get(leaf)??0)+1);}
  assert([...counts.values()].every(count=>count===4));
});

test('tile assignment retains complete crossing triangles and conservative bounds',()=>{
  const doc=new Document(),p=primitive(doc,[31,0,0,35,0,0,31,0,3,1,0,1,2,0,1,1,0,2],[0,1,2,3,4,5]);
  const parts=splitPrimitiveByTile(doc,p,32);
  assert.equal(parts.length,2);assert.equal(parts.reduce((n,item)=>n+triangleCount(item.primitive),0),2);
  const crossing=parts.find(item=>item.id==='x1_z0')!;assert.deepEqual(boundsOf(crossing.primitive),[[31,0,0],[35,0,3]]);
});

test('offline batches retain transforms and semantic separation without dropping triangles',async()=>{
  const doc=new Document(),scene=doc.createScene();doc.getRoot().setDefaultScene(scene);
  for(const [role,x]of [['walls',10],['columns',20],['roof_shell',30],['tree_leaves',40]] as const){
    const p=primitive(doc,[0,0,0,1,0,0,0,0,1],[0,1,2]);
    scene.addChild(doc.createNode(role).setTranslation([x,2,0]).setExtras({gardenRole:role}).setMesh(doc.createMesh().addPrimitive(p)));
  }
  const result=await prepareDocument(doc,{id:'test'});assert.equal(result.triangles,4);
  const nodes=doc.getRoot().listNodes().filter(n=>n.getMesh());assert.equal(nodes.length,3);
  assert.deepEqual(new Set(nodes.map(n=>n.getExtras().gardenRole)),new Set(['architecture','roof_shell','tree_leaves']));
  assert(nodes.every(n=>n.getTranslation().every(v=>v===0)));
  assert.deepEqual(nodes.find(n=>n.getExtras().gardenRole==='architecture')!.getExtras().bounds,[[10,2,0],[21,2,1]]);
});

test('world water and surroundings stay whole while terrain receives spatial tiles',async()=>{
  const doc=new Document(),scene=doc.createScene();doc.getRoot().setDefaultScene(scene);
  for(const role of ['water','surroundings','terrain']){
    const p=primitive(doc,[0,0,0,4,0,0,0,0,4,64,0,0,68,0,0,64,0,4],[0,1,2,3,4,5],role);
    scene.addChild(doc.createNode(role).setExtras({gardenRole:role}).setMesh(doc.createMesh().addPrimitive(p)));
  }
  await prepareDocument(doc,{id:'garden',world:true});const nodes=doc.getRoot().listNodes().filter(n=>n.getMesh());
  assert.equal(nodes.filter(n=>n.getExtras().gardenRole==='water').length,1);
  assert.equal(nodes.filter(n=>n.getExtras().gardenRole==='surroundings').length,1);
  assert.equal(nodes.filter(n=>n.getExtras().gardenRole==='terrain').length,2);
  assert.equal(normalizedRole('inscription'),'inscription');
});

test('GLB packing aligns UTF-8 JSON and preserves binary payload',()=>{
  const binary=Buffer.from([1,2,3,4,5]);const glb=packGlb({asset:{version:'2.0'},name:'大观园'},binary);
  assert.equal(glb.length,glb.readUInt32LE(8));assert.equal(glb.length%4,0);
  const length=glb.readUInt32LE(12);assert.equal(JSON.parse(glb.toString('utf8',20,20+length)).name,'大观园');
  assert.deepEqual(glb.subarray(28+length,33+length),binary);
});

test('degenerate cleanup removes only exact zero area and retains fine nonzero triangles',()=>{
  const doc=new Document(),p=primitive(doc,[0,0,0,1,0,0,2,0,0,0,0,1e-9],[0,1,2,0,1,3]);
  assert.equal(removeDegenerateTriangles(p),1);assert.equal(triangleCount(p),1);
  assert.deepEqual([...p.getIndices()!.getArray()!],[0,1,3]);
});

test('vertex colours survive real Draco roundtrip and do not merge with colourless terrain',async()=>{
  const doc=new Document(),scene=doc.createScene();doc.getRoot().setDefaultScene(scene);
  const rgba=[1,0,0,1,0,.5,0,.75,0,0,1,.25],expected=[] as Array<{position:number[];colour:number[]}>;
  for(const offset of [0,2]){
    const positions=[offset,0,0,offset+1,0,0,offset,0,1];
    const p=primitive(doc,positions,[0,1,2]);
    p.setAttribute('COLOR_0',doc.createAccessor('',doc.getRoot().listBuffers()[0]).setType('VEC4').setArray(new Float32Array(rgba)));
    scene.addChild(doc.createNode('coloured-'+offset).setExtras({gardenRole:'terrain'}).setMesh(doc.createMesh().addPrimitive(p)));
    for(let i=0;i<3;i++)expected.push({position:positions.slice(i*3,i*3+3),colour:rgba.slice(i*4,i*4+4)});
  }
  scene.addChild(doc.createNode('plain').setExtras({gardenRole:'terrain'}).setMesh(doc.createMesh().addPrimitive(
    primitive(doc,[5,0,0,6,0,0,5,0,1],[0,1,2]))));
  const backgroundPositions=[7,0,0,8,0,0,7,0,1],background=primitive(doc,backgroundPositions,[0,1,2]);
  background.setAttribute('COLOR_0',doc.createAccessor('',doc.getRoot().listBuffers()[0]).setType('VEC4').setArray(new Float32Array(rgba)));
  scene.addChild(doc.createNode('coloured-background').setExtras({gardenRole:'surroundings'}).setMesh(doc.createMesh().addPrimitive(background)));
  for(let i=0;i<3;i++)expected.push({position:backgroundPositions.slice(i*3,i*3+3),colour:rgba.slice(i*4,i*4+4)});
  await prepareDocument(doc,{id:'garden',world:true});
  assert.equal(doc.getRoot().listNodes().filter(n=>n.getMesh()).length,3);
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.encoder':await draco3d.createEncoderModule(),'draco3d.decoder':await draco3d.createDecoderModule(),
  });
  const encoded=await serializeSharedGlb(io,doc);
  assert(encoded.json.extensionsUsed?.includes('KHR_draco_mesh_compression'));
  const decoded=await io.readBinary(encoded.bytes);
  const primitives=decoded.getRoot().listMeshes().flatMap(mesh=>mesh.listPrimitives());
  assert.equal(primitives.length,3);assert.equal(primitives.filter(p=>!p.getAttribute('COLOR_0')).length,1);
  const coloured=primitives.filter(p=>p.getAttribute('COLOR_0'));
  assert.equal(coloured.reduce((n,p)=>n+p.getAttribute('POSITION')!.getCount(),0),expected.length);
  for(const p of coloured){
    const position=p.getAttribute('POSITION')!,colour=p.getAttribute('COLOR_0')!;
    assert.equal(colour.getType(),'VEC4');
    for(let i=0;i<position.getCount();i++){
      const actualPosition=position.getElement(i,[]),actualColour=colour.getElement(i,[]);
      const original=expected.find(item=>item.position.every((v,axis)=>Math.abs(v-actualPosition[axis])<.0002));
      assert(original,'Decoded position must correspond to an original vertex');
      for(let channel=0;channel<4;channel++)assert(Math.abs(actualColour[channel]-original.colour[channel])<.0003,'Colour changed beyond 12-bit quantization');
    }
  }
});

test('scene Draco quantization keeps adjoining terrain and apron edge vertices identical',async()=>{
  const doc=new Document(),scene=doc.createScene();doc.getRoot().setDefaultScene(scene);
  const inner=primitive(doc,[-96,.137,-5.234,96,.137,-5.234,-96,.329,6.781,96,.329,6.781],[0,1,2,1,3,2]);
  const apron=primitive(doc,[96,.137,-5.234,516,.01,-350,96,.329,6.781,516,-.22,512],[0,1,2,1,3,2]);
  scene.addChild(doc.createNode('inner').setExtras({gardenRole:'terrain'}).setMesh(doc.createMesh().addPrimitive(inner)));
  scene.addChild(doc.createNode('apron').setExtras({gardenRole:'surroundings'}).setMesh(doc.createMesh().addPrimitive(apron)));
  await prepareDocument(doc,{id:'garden',world:true});
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.encoder':await draco3d.createEncoderModule(),'draco3d.decoder':await draco3d.createDecoderModule(),
  });
  const encoded=await serializeSharedGlb(io,doc,{precision:{position:20,normal:10,texcoord:14},volume:'scene'});
  const decoded=await io.readBinary(encoded.bytes);
  for(const expected of [[96,.137,-5.234],[96,.329,6.781]]){
    const matches=[] as number[][];const roles=new Set();
    for(const node of decoded.getRoot().listNodes())for(const p of node.getMesh()?.listPrimitives()??[]){
      const position=p.getAttribute('POSITION')!;
      for(let i=0;i<position.getCount();i++){
        const point=position.getElement(i,[]);
        if(point.every((value,axis)=>Math.abs(value-expected[axis])<.002)){matches.push(point);roles.add(node.getExtras().gardenRole);}
      }
    }
    assert.deepEqual(roles,new Set(['terrain','surroundings']));
    assert.equal(new Set(matches.map(point=>point.join(','))).size,1,'Shared edge must decode to exactly the same coordinates');
  }
});
