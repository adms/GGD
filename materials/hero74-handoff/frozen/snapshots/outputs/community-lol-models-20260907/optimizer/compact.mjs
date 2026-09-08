import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {resample,dedup,prune} from '@gltf-transform/functions';
import fs from 'node:fs/promises';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const source='/private/tmp/ggd-lol-models/converted/lux.glb';const doc=await io.read(source);
const before=doc.getRoot().listAnimations().map(a=>({name:a.getName(),channels:a.listChannels().length}));
await doc.transform(resample({tolerance:1e-5,cleanup:false}),dedup());
let removed=0;
for(const anim of doc.getRoot().listAnimations())for(const channel of [...anim.listChannels()]){
 const node=channel.getTargetNode(),path=channel.getTargetPath(),sampler=channel.getSampler(),out=sampler?.getOutput();
 const expected=path==='translation'?node.getTranslation():path==='rotation'?node.getRotation():path==='scale'?node.getScale():null;
 if(!expected||!out||sampler.getInterpolation()==='CUBICSPLINE')continue;
 const array=out.getArray(),width=expected.length;let equal=true;
 for(let i=0;i<array.length&&equal;i++)if(Math.abs(array[i]-expected[i%width])>1e-6)equal=false;
 if(equal){channel.dispose();removed++;}
}
await doc.transform(prune({keepLeaves:true,keepAttributes:true}));
console.error('removed constant rest channels',removed);
await fs.mkdir('/private/tmp/ggd-lol-models/optimized',{recursive:true});await io.write('/private/tmp/ggd-lol-models/optimized/lux.glb',doc);
const after=doc.getRoot().listAnimations().map(a=>({name:a.getName(),channels:a.listChannels().length}));
console.log(JSON.stringify({before,after,bytes:(await fs.stat('/private/tmp/ggd-lol-models/optimized/lux.glb')).size},null,2));
