import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const root=process.cwd();
const load=(p:string)=>import(pathToFileURL(resolve(root,p)).href);
const {modelUploadFixture}=await load('packages/shared/src/content/modelUpload/fixtures.ts');
const {encodeUploadGlb,parseUploadGlb}=await load('packages/shared/src/content/modelUpload/glb.ts');
const {normalizeUploadedModel}=await load('packages/shared/src/content/modelUpload/normalize.ts');
const {inspectModelUpload}=await load('packages/shared/src/content/modelUpload/inspect.ts');
const {prepareUploadedHeroModel}=await load('packages/shared/src/content/modelUpload/heroModel.ts');
const {resizeImageWithFfmpeg}=await load('apps/content-api/src/resizeImage.node.ts');
const out=resolve(root,'../outputs/priority-81-handoff-20260911/merge-review-evidence');
const check=async(b:Uint8Array)=>{try{let x=await inspectModelUpload(b);return {ok:true,clips:x.clips,textureCount:x.textures.length}}catch(e){return {ok:false,error:String(e)}}};
const evidence:any={checkedAt:new Date().toISOString(),scope:'in-memory authored fixtures; no content/index writes',tests:{}};
{
 const f=modelUploadFixture(); f.json.animations[1].name='Cast';
 const img=readFileSync(resolve(out,'authored-512.jpg'));
 const v=f.json.bufferViews.length;
 f.json.bufferViews.push({buffer:0,byteOffset:f.bin.length,byteLength:img.length});
 f.json.images=[{mimeType:'image/jpeg',bufferView:v}];
 const bin=new Uint8Array(f.bin.length+img.length);bin.set(f.bin);bin.set(img,f.bin.length);
 const bytes=encodeUploadGlb(f.json,bin);
 const before=await check(bytes);
 const normalized=await normalizeUploadedModel(bytes,{resizeImage:resizeImageWithFfmpeg});
 const after=await check(normalized.bytes);
 const p=parseUploadGlb(normalized.bytes);const image=p.json.images[0],view=p.json.bufferViews[image.bufferView];
 const header=Buffer.from(p.bin.slice(view.byteOffset,view.byteOffset+8)).toString('hex');
 evidence.tests.jpegResizeMime={before,report:normalized.report,after,declaredMime:image.mimeType,actualHeaderHex:header,expectedPngHeader:'89504e470d0a1a0a'};
}
{
 const f=modelUploadFixture();f.json.animations[1].name='Cast';
 const c=f.json.animations[0];const sampler=c.samplers[0];
 const ti=f.json.accessors.length;f.json.accessors.push({...f.json.accessors[sampler.input],count:1,min:[0],max:[0]});
 const oi=f.json.accessors.length;f.json.accessors.push({...f.json.accessors[sampler.output],count:1});
 const zero={name:'ZeroAuthoredPose',channels:c.channels.map((x:any)=>structuredClone(x)),samplers:[{...sampler,input:ti,output:oi}]};
 f.json.animations.unshift(zero);
 const bytes=encodeUploadGlb(f.json,f.bin);
 const before=await check(bytes);
 const n=await normalizeUploadedModel(bytes);
 const after=await check(n.bytes);
 const selections=Object.fromEntries(['idle','run','attack','cast','hurt','death'].map(s=>[s,1]));
 let prepared:any;try{const p=await prepareUploadedHeroModel(bytes,selections);prepared={ok:true,clipMap:p.model.clipMap}}catch(e){prepared={ok:false,error:String(e)}}
 evidence.tests.zeroClipInspectorAndIndex={originalNames:f.json.animations.map((x:any)=>x.name),selectedOriginalIndex:1,selectedOriginalName:'Motion',before,normalizationReport:n.report,after,prepared};
}
evidence.sourceFiles=['packages/shared/src/content/modelUpload/normalize.ts','packages/shared/src/content/modelUpload/heroModel.ts','apps/editor/src/hero/modelUpload.worker.ts','apps/content-api/src/resizeImage.node.ts'].map(p=>({path:p,sha256:createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex')}));
writeFileSync(resolve(out,'normalization-repros.after.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
