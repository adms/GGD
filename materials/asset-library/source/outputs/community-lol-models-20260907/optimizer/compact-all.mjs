import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {resample, dedup, prune} from '@gltf-transform/functions';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const base = process.argv[2] ?? '/private/tmp/ggd-lol-models';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const manifest = JSON.parse(await fs.readFile(path.join(base,process.argv[3]??'conversion-manifest.json'),'utf8'));
const outputDir = process.argv[4]??'optimized-safe';
const rows = [];
for (const item of manifest.models) {
  const source = path.join(base,item.file);
  const doc = await io.read(source);
  const before = doc.getRoot().listAnimations().map(a=>({name:a.getName(),channels:a.listChannels().length}));
  // Removing a rest channel from only one clip can leave the previous clip's
  // transform behind. Remove a property only when it is at rest in EVERY clip.
  const candidates = new Map();
  for (const anim of doc.getRoot().listAnimations()) for (const ch of anim.listChannels()) {
    const node = ch.getTargetNode(), target = ch.getTargetPath();
    const sampler = ch.getSampler(), output = sampler?.getOutput();
    const rest = target==='translation'?node.getTranslation():target==='rotation'?node.getRotation():target==='scale'?node.getScale():null;
    let safe = Boolean(rest && output && sampler.getInterpolation()!=='CUBICSPLINE');
    if (safe) {
      const values=output.getArray();
      safe=values.length>0 && values.every((v,i)=>Number.isFinite(v)&&Math.abs(v-rest[i%rest.length])<=1e-6);
    }
    let properties=candidates.get(node);
    if(!properties)candidates.set(node,properties=new Map());
    properties.set(target,(properties.get(target)??true)&&safe);
  }
  let removed=0;
  for(const anim of doc.getRoot().listAnimations()) for(const ch of [...anim.listChannels()]) {
    if(candidates.get(ch.getTargetNode())?.get(ch.getTargetPath())) {ch.dispose();removed++;}
  }
  await doc.transform(resample({tolerance:1e-5,cleanup:false}),dedup(),prune({keepLeaves:true,keepAttributes:true}));
  const out=path.join(base,outputDir,item.character+'.glb');
  await fs.mkdir(path.dirname(out),{recursive:true});await io.write(out,doc);
  const data=await fs.readFile(out);
  const after=doc.getRoot().listAnimations().map(a=>({name:a.getName(),channels:a.listChannels().length}));
  if(JSON.stringify(before.map(a=>a.name))!==JSON.stringify(after.map(a=>a.name)))throw new Error('clip inventory changed: '+item.character);
  const row={character:item.character,source:item.file,file:path.relative(base,out),bytes:data.length,sha256:createHash('sha256').update(data).digest('hex'),removedRestChannels:removed,before,after};
  rows.push(row);
  console.log(JSON.stringify({character:item.character,bytes:data.length,clips:after.length,maxChannels:Math.max(...after.map(a=>a.channels)),removedRestChannels:removed}));
}
await fs.writeFile(path.join(base,outputDir+'-manifest.json'),JSON.stringify({schema:'ggd-lol-local-optimization@1',method:'Remove only properties at rest across all clips; resample tolerance 1e-5; preserve leaves and attributes',models:rows},null,2)+'\n');
