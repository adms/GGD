import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {resample, dedup, prune} from '@gltf-transform/functions';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const base=process.argv[2]??'/private/tmp/ggd-lol-models';
const manifest=JSON.parse(await fs.readFile(path.join(base,'ggd-selected-manifest.json'),'utf8'));
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const tolerance={translation:1e-4,rotation:1e-5,scale:1e-4};
const rows=[];
function rest(n,p){return p==='translation'?n.getTranslation():p==='rotation'?n.getRotation():p==='scale'?n.getScale():null;}
for(const item of manifest.models){
 const input=path.join(base,item.file),doc=await io.read(input),root=doc.getRoot(),animations=root.listAnimations();
 const before=animations.map(a=>({name:a.getName(),channels:a.listChannels().length}));
 // This local candidate uses GGD's static attachPoints. Raw LoL attachment
 // animations remain in the original backup. Keep every rendered mesh node,
 // every nonzero-weight skin joint, and all their ancestors.
 const required=new Set();
 function mark(n){while(n){required.add(n);n=n.getParentNode();}}
 for(const node of root.listNodes()){
  if(!node.getMesh())continue;mark(node);const skin=node.getSkin();if(!skin)continue;
  const joints=skin.listJoints();
  for(const primitive of node.getMesh().listPrimitives()){
   const sets=primitive.listSemantics().filter(s=>/^JOINTS_\d+$/.test(s));
   if(!sets.length)throw Error('skinned primitive without joint weights');
   for(const semantic of sets){
    const jointIndices=primitive.getAttribute(semantic).getArray();
    const weights=primitive.getAttribute(semantic.replace('JOINTS','WEIGHTS'))?.getArray();
    if(!weights||weights.length!==jointIndices.length)throw Error('invalid skin attribute pairing');
    for(let i=0;i<weights.length;i++){
     if(!Number.isFinite(weights[i])||weights[i]<0)throw Error('invalid weight');
     if(weights[i]>0){const joint=joints[jointIndices[i]];if(!joint)throw Error('invalid joint');mark(joint);}
    }
   }
  }
 }
 const unusedNodes=root.listNodes().filter(n=>!required.has(n)).map(n=>n.getName());
 const constants=new Map();
 for(const anim of animations)for(const ch of anim.listChannels()){
  const node=ch.getTargetNode(),prop=ch.getTargetPath(),sampler=ch.getSampler(),output=sampler?.getOutput();
  if(!required.has(node))continue;
  let props=constants.get(node);if(!props)constants.set(node,props=new Map());
  const values=output?.getArray(),def=rest(node,prop);
  let r=props.get(prop);
  if(!r)props.set(prop,r={ref:values&&def?Array.from(values.slice(0,def.length)):[],safe:!!def,restSafe:!!def,seen:new Set()});
  if(r.seen.has(anim))throw Error('duplicate channel target');r.seen.add(anim);
  r.restSafe&&=!!values?.length&&values.every((v,i)=>Number.isFinite(v)&&Math.abs(v-def[i%def.length])<=tolerance[prop]);
  r.safe&&=!!values?.length&&sampler.getInterpolation()!=='CUBICSPLINE'&&values.every((v,i)=>Number.isFinite(v)&&Math.abs(v-r.ref[i%r.ref.length])<=tolerance[prop]);
 }
 const baked=[];
 for(const[node,props]of constants)for(const[prop,r]of props){
  const def=rest(node,prop);if(!def){r.safe=false;continue;}
  // An omitted channel can observe the node default. Include that default in
  // the comparison rather than retaining a stale pose from another clip.
  if(r.seen.size!==animations.length)r.safe&&=r.restSafe;
  if(!r.safe)continue;
  if(r.restSafe){r.ref=def;}else{
   baked.push({node:node.getName(),path:prop,before:def,after:r.ref});
   if(prop==='translation')node.setTranslation(r.ref);
   else if(prop==='rotation')node.setRotation(r.ref);
   else node.setScale(r.ref);
  }
 }
 let removedUnused=0,removedConstant=0;
 for(const anim of animations)for(const ch of [...anim.listChannels()]){
  if(!required.has(ch.getTargetNode())){ch.dispose();removedUnused++;}
  else if(constants.get(ch.getTargetNode())?.get(ch.getTargetPath())?.safe){ch.dispose();removedConstant++;}
 }
 await doc.transform(resample({tolerance:1e-5,cleanup:false}),dedup({keepUniqueNames:true}),prune({keepLeaves:true,keepAttributes:true}));
 const output=path.join(base,'ggd-runtime-candidate',item.character+'.glb');
 await fs.mkdir(path.dirname(output),{recursive:true});await io.write(output,doc);
 const bytes=await fs.readFile(output),after=root.listAnimations().map(a=>({name:a.getName(),channels:a.listChannels().length}));
 if(JSON.stringify(before.map(a=>a.name))!==JSON.stringify(after.map(a=>a.name)))throw Error('clip inventory changed');
 const row={character:item.character,source:item.file,sourceSha256:createHash('sha256').update(await fs.readFile(input)).digest('hex'),file:path.relative(base,output),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),removedUnused,removedConstant,unusedNodes,baked,before,after,maxChannels:Math.max(...after.map(a=>a.channels))};
 rows.push(row);console.log(JSON.stringify({character:row.character,bytes:row.bytes,maxChannels:row.maxChannels,removedUnused,removedConstant,bakedProperties:baked.length}));
}
await fs.writeFile(path.join(base,'ggd-runtime-candidate-manifest.json'),JSON.stringify({schema:'ggd-lol-local-optimization@1',method:'Selected six clips; omit animations only on nodes without rendered mesh/weighted joint descendants; globally constant TRS to defaults; resample 1e-5; static GGD attachment offsets only; no original attachment animation guarantee',tolerance,models:rows},null,2)+'\n');
