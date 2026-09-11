// Reuse the locked glTF-Transform utility; never discard a nonzero influence.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {sortPrimitiveWeights} from '@gltf-transform/functions';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const base=path.resolve(process.argv[2]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const output=path.join(base,'canonical-skin');
await fs.mkdir(output);
const rows=[];
const hash=b=>createHash('sha256').update(b).digest('hex');
for(const slug of ['chogath','ashe','blitzcrank','malphite']){
 const input=path.join(base,'ggd-runtime-candidate',slug+'.glb');
 const doc=await io.read(input);
 let vertices=0,maxEffectiveWeightDelta=0,clearedZeroSlots=0;
 for(const mesh of doc.getRoot().listMeshes())for(const prim of mesh.listPrimitives()){
  assert.equal(prim.listSemantics().filter(n=>n.startsWith('WEIGHTS_')).length,1);
  const joints=prim.getAttribute('JOINTS_0'),weights=prim.getAttribute('WEIGHTS_0');
  const oldJ=Array.from(joints.getArray()),oldW=Array.from(weights.getArray());
  const other=prim.listSemantics().filter(n=>!n.startsWith('JOINTS_')&&!n.startsWith('WEIGHTS_')).map(n=>[n,Array.from(prim.getAttribute(n).getArray())]);
  sortPrimitiveWeights(prim); // Default Infinity: no influence limit or reduction.
  for(const[n,array]of other)assert.deepEqual(Array.from(prim.getAttribute(n).getArray()),array);
  const newJ=joints.getArray(),newW=weights.getArray();
  for(let i=0;i<oldW.length;i+=4){
   const before=new Map(),after=new Map();let total=0;
   for(let k=0;k<4;k++)total+=oldW[i+k];
   assert.ok(total>0);
   for(let k=0;k<4;k++){
    if(oldW[i+k]>0)before.set(oldJ[i+k],(before.get(oldJ[i+k])??0)+oldW[i+k]/total);
    if(newW[i+k]>0)after.set(newJ[i+k],(after.get(newJ[i+k])??0)+newW[i+k]);
    if(oldW[i+k]===0&&oldJ[i+k]!==0)clearedZeroSlots++;
    if(newW[i+k]===0)assert.equal(newJ[i+k],0);
   }
   assert.deepEqual([...before.keys()].sort(),[...after.keys()].sort());
   for(const[j,w]of before)maxEffectiveWeightDelta=Math.max(maxEffectiveWeightDelta,Math.abs(w-after.get(j)));
   vertices++;
  }
 }
 assert.ok(maxEffectiveWeightDelta<1e-6);
 const target=path.join(output,slug+'.glb');
 await io.write(target,doc);
 const row={nativeId:slug,source:input,sourceSha256:hash(await fs.readFile(input)),output:target,outputSha256:hash(await fs.readFile(target)),vertices,clearedZeroSlots,maxEffectiveWeightDelta,nonzeroJointInfluencesPreserved:true,otherVertexAttributesUnchanged:true};
 rows.push(row);console.log(JSON.stringify(row));
}
await fs.copyFile(path.join(base,'ggd-runtime-candidate','ahri.glb'),path.join(output,'ahri.glb'));
await fs.writeFile(path.join(base,'zero-weight-joints-receipt.json'),JSON.stringify({method:'Locked sortPrimitiveWeights with default Infinity; no influence reduction; effective normalized weights verified',models:rows},null,2)+'\n');
