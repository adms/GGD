import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const root=resolve(process.argv[2]),repo=resolve(process.argv[3]);
const req=createRequire(import.meta.url),decoder=req('./meshopt_decoder.cjs');
const validator=createRequire(join(repo,'packages/shared/package.json'))('gltf-validator');
await decoder.ready;
const src=readFileSync(join(root,'original/model.glb')),sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(src.readUInt32LE(0),0x46546c67);assert.equal(src.readUInt32LE(8),src.length);
const jlen=src.readUInt32LE(12),doc=JSON.parse(src.subarray(20,20+jlen).toString()),original=structuredClone(doc),bin=src.subarray(28+jlen);
const parts=[],views=[];let size=0,decoded=0;
for(const [i,v] of doc.bufferViews.entries()){
 let buf;const ext=v.extensions?.EXT_meshopt_compression;
 if(ext){assert.equal(ext.buffer,0);buf=Buffer.alloc(ext.count*ext.byteStride);decoder.decodeGltfBuffer(buf,ext.count,ext.byteStride,bin.subarray(ext.byteOffset,ext.byteOffset+ext.byteLength),ext.mode,ext.filter);assert.equal(buf.length,v.byteLength);decoded++;}
 else {assert.equal(v.buffer,0);buf=bin.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength);}
 const n={...v,buffer:0,byteOffset:size};if(n.extensions){delete n.extensions.EXT_meshopt_compression;if(!Object.keys(n.extensions).length)delete n.extensions;}
 views.push(n);parts.push(buf);size+=buf.length;const padding=(4-size%4)%4;if(padding){parts.push(Buffer.alloc(padding));size+=padding;}
}
const newbin=Buffer.concat(parts);doc.bufferViews=views;doc.buffers=[{byteLength:newbin.length}];
for(const k of ['extensionsUsed','extensionsRequired']){doc[k]=(doc[k]??[]).filter(x=>x!=='EXT_meshopt_compression');if(!doc[k].length)delete doc[k];}
let jb=Buffer.from(JSON.stringify(doc));if(jb.length%4)jb=Buffer.concat([jb,Buffer.alloc(4-jb.length%4,32)]);
const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jb.length+newbin.length,8);header.writeUInt32LE(jb.length,12);header.writeUInt32LE(0x4e4f534a,16);const bh=Buffer.alloc(8);bh.writeUInt32LE(newbin.length);bh.writeUInt32LE(0x004e4942,4);const glb=Buffer.concat([header,jb,bh,newbin]);
writeFileSync(join(root,'derived/model-decoded.glb'),glb,{flag:'wx'});
const types={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16},comp={5120:[1,'getInt8'],5121:[1,'getUint8'],5122:[2,'getInt16'],5123:[2,'getUint16'],5125:[4,'getUint32'],5126:[4,'getFloat32']};
function accessor(id){const a=doc.accessors[id];assert(!a.sparse);const v=views[a.bufferView],n=types[a.type],[b,method]=comp[a.componentType],dv=new DataView(newbin.buffer,newbin.byteOffset,newbin.byteLength),stride=v.byteStride??b*n,offset=(v.byteOffset??0)+(a.byteOffset??0),r=[];for(let i=0;i<a.count;i++){const row=[];for(let k=0;k<n;k++)row.push(dv[method](offset+i*stride+k*b,true));r.push(row);}return r;}
const skinj=new Set(doc.skins.flatMap(s=>s.joints)),anims=[];
for(const [i,a] of doc.animations.entries()){
 const chans=[];let start=Infinity,end=-Infinity;
 for(const c of a.channels){const s=a.samplers[c.sampler],t=accessor(s.input).flat(),values=accessor(s.output);assert(t.every(Number.isFinite));assert(t.every((v,i)=>!i||v>=t[i-1]));const varied=values.some(v=>v.some((x,j)=>Math.abs(x-values[0][j])>1e-7));start=Math.min(start,...t);end=Math.max(end,...t);chans.push({node:c.target.node,nodeName:doc.nodes[c.target.node]?.name,path:c.target.path,inSkin:skinj.has(c.target.node),interpolation:s.interpolation??'LINEAR',keyCount:t.length,outputCount:values.length,hasChangingValues:varied,firstTime:t[0],lastTime:t.at(-1),firstValue:values[0],lastValue:values.at(-1)});}
 anims.push({index:i,name:a.name,seconds:end-start,start,end,channelCount:chans.length,changingChannels:chans.filter(c=>c.hasChangingValues&&c.lastTime>c.firstTime).length,channels:chans});
}
const report=await validator.validateBytes(new Uint8Array(glb),{uri:'model-decoded.glb',maxIssues:0,writeTimestamp:false});
writeFileSync(join(root,'analysis/khronos-decoded-full.json'),JSON.stringify(report,null,2)+'\n');
const primitives=doc.meshes.flatMap(m=>m.primitives).map(p=>({mode:p.mode??4,material:p.material,vertices:doc.accessors[p.attributes.POSITION].count,indices:p.indices===undefined?null:doc.accessors[p.indices].count,triangles:(p.mode??4)===4?(p.indices===undefined?doc.accessors[p.attributes.POSITION].count:doc.accessors[p.indices].count)/3:null,attributes:p.attributes}));
const result={schema:'ggd-palworld-source-static-analysis@1',source:{path:'original/model.glb',bytes:src.length,sha256:sha(src)},derived:{path:'derived/model-decoded.glb',bytes:glb.length,sha256:sha(glb),purpose:'Lossless EXT_meshopt buffer decompression for analysis; no geometry retargeting or runtime standardization; external OP.GG material recipe/textures remain required.'},decodedBufferViews:decoded,nodes:doc.nodes.length,skins:doc.skins.map(s=>({joints:s.joints.length,jointNames:s.joints.map(i=>doc.nodes[i].name)})),primitives,materials:doc.materials,animations:anims,summary:{meshes:doc.meshes.length,primitives:primitives.length,triangles:primitives.reduce((n,p)=>n+p.triangles,0),joints:skinj.size,animationCount:anims.length,clipsWithTimeAndChangingValues:anims.filter(a=>a.seconds>0&&a.changingChannels>0).length,animationSeconds:anims.reduce((n,a)=>n+a.seconds,0),maxChannels:Math.max(...anims.map(a=>a.channelCount))},fidelity:{animationsStructurallyIdentical:JSON.stringify(original.animations)===JSON.stringify(doc.animations),nodesStructurallyIdentical:JSON.stringify(original.nodes)===JSON.stringify(doc.nodes),skinsStructurallyIdentical:JSON.stringify(original.skins)===JSON.stringify(doc.skins),timingUnit:'glTF 2.0 animation input is seconds; original Unreal sampling/FPS not independently obtained',nativeProvenance:'Source site material recipe identifies original Pal/Content paths; game-derived web export, not original Unreal container. No generated or retargeted motions added.',vfx:'Ring-named bone-animation clips and emissive recipes retained; no independent Unreal particles/VFX systems obtained',runtimeReadiness:'pending material reconstruction/standardization and visual validation'},validator:{errors:report.issues.numErrors,warnings:report.issues.numWarnings,infos:report.issues.numInfos,truncated:report.issues.truncated}};
writeFileSync(join(root,'analysis/model-analysis.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result.summary,validator:result.validator,derived:result.derived},null,2));
