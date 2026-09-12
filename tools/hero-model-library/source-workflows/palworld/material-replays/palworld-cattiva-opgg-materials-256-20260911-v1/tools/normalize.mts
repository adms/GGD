/** Preserve all source clips; use the actual GGD normalizer, resizer and budget. */
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const [repoArg, sourceArg, outArg] = process.argv.slice(2);
if (!outArg) throw Error('Usage: node --import tsx normalize.mts <repo> <frozen-high-resolution-conversion> <new-result>');
const repo=resolve(repoArg), source=resolve(sourceArg), out=resolve(outArg);
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const save=(name:string,data:unknown)=>writeFileSync(join(out,name),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
const importRepo=(name:string)=>import(pathToFileURL(join(repo,name)).href);
const [{normalizeUploadedModel},{inspectModelUpload},{resizeImageWithFfmpeg},{heroModelBudgetIssues},{HERO_MODEL_BUDGET}] = await Promise.all([
 importRepo('packages/shared/src/content/modelUpload/normalize.ts'),importRepo('packages/shared/src/content/modelUpload/inspect.ts'),
 importRepo('apps/content-api/src/resizeImage.node.ts'),importRepo('packages/shared/src/content/modelUpload/heroModel.ts'),importRepo('packages/shared/src/content/modelUpload/budget.ts')]);
const frozen=JSON.parse(readFileSync(join(source,'files-sha256.json'),'utf8'));
for(const row of frozen.files){const b=readFileSync(join(source,row.path));assert.equal(b.length,row.bytes);assert.equal(sha(b),row.sha256,row.path)}
const input=readFileSync(join(source,'result/body.glb'));
assert.equal(sha(input),'f1c7ddd235164ac83dd9eb48021cb76137292acf52f91473734be3e50bfb1934');
const before=await inspectModelUpload(new Uint8Array(input));
const normalized=await normalizeUploadedModel(new Uint8Array(input),{maxTextureEdge:256,resizeImage:resizeImageWithFfmpeg});
const after=await inspectModelUpload(normalized.bytes);
assert.equal(normalized.report.droppedZeroClips.length,0);
assert.deepEqual(normalized.report.clipIndexMap,Array.from({length:33},(_,i)=>i));
assert.equal(normalized.report.texturesOverCap.length,0);
assert.equal(after.clips.length,33);assert.equal(after.textures.length,5);
assert.ok(after.textures.every((t:any)=>t.width===256&&t.height===256));
for(const field of ['nodes','skins','scenes','scene','animations','meshes','accessors','materials','textures','samplers','extensionsUsed','extensionsRequired'])assert.deepEqual(after.json[field],before.json[field],field);
const dims:any={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16},sizes:any={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
const accessorBytes=(model:any,index:number)=>{
 const a=model.json.accessors[index];assert.ok(!a.sparse);const v=model.json.bufferViews[a.bufferView];const width=dims[a.type]*sizes[a.componentType];assert.ok(width>0);
 const base=(v.byteOffset??0)+(a.byteOffset??0),stride=v.byteStride??width;const b=Buffer.alloc(a.count*width);
 for(let i=0;i<a.count;i++)b.set(model.bin.subarray(base+i*stride,base+i*stride+width),i*width);
 return b;
};
const accessors=[];
for(let i=0;i<before.json.accessors.length;i++){
 const a=accessorBytes(before,i),b=accessorBytes(after,i);assert.deepEqual(a,b,`accessor ${i}`);
 accessors.push({index:i,componentType:after.json.accessors[i].componentType,type:after.json.accessors[i].type,count:after.json.accessors[i].count,bytes:b.length,sha256:sha(b),unchanged:true});
}
const currentBudget=heroModelBudgetIssues(after);
assert.deepEqual(currentBudget.errors,[],'Current GGD budget did not pass');
mkdirSync(out,{recursive:false});mkdirSync(join(out,'textures'));mkdirSync(join(out,'validation'));
writeFileSync(join(out,'body.glb'),normalized.bytes,{flag:'wx'});
const textures=after.json.images.map((image:any,index:number)=>{
 const v=after.json.bufferViews[image.bufferView],b=after.bin.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength);
 const file=`textures/${image.name||index}.png`;writeFileSync(join(out,file),b,{flag:'wx'});return {path:file,...after.textures[index],source:before.textures[index]};
});
const pins=['packages/shared/src/content/modelUpload/normalize.ts','packages/shared/src/content/modelUpload/inspect.ts','packages/shared/src/content/modelUpload/glb.ts','packages/shared/src/content/modelUpload/heroModel.ts','packages/shared/src/content/modelUpload/budget.ts','apps/content-api/src/resizeImage.node.ts'].map(path=>({path,sha256:sha(readFileSync(join(repo,path)))}));
const metrics=(x:any)=>({triangles:x.triangles,meshes:x.meshes,maxTextureEdge:Math.max(...x.textures.flatMap((t:any)=>[t.width,t.height])),maxClipChannels:Math.max(...x.clips.map((c:any)=>c.channels)),clipCount:x.clips.length});
save('normalization.json',{schema:'ggd.cattiva.normalization-256@1',inputPath:join(source,'result/body.glb'),inputBytes:input.length,inputSha256:sha(input),outputSha256:sha(normalized.bytes),outputBytes:normalized.bytes.length,report:normalized.report,sourceManifestSha256:sha(readFileSync(join(source,'files-sha256.json'))),normalizer:'normalizeUploadedModel',resizer:'resizeImageWithFfmpeg',maxTextureEdge:256,ffmpegVersion:execFileSync('ffmpeg',['-version'],{encoding:'utf8'}).split('\n')[0],toolPins:pins,preservation:{allAccessorBytesUnchanged:true,accessorCount:accessors.length,allAnimationsNodesSkinsMaterialsJsonUnchanged:true,sourceProvidedAnimationCount:33,proceduralAnimationsAdded:0,clipsDropped:0},textures});
save('accessor-preservation.json',{schema:'ggd.cattiva.normalization-accessor-proof@1',sourceSha256:sha(input),targetSha256:sha(normalized.bytes),accessors});
save('validation/current-budget.json',{schema:'ggd.cattiva.current-budget@1',gate:'heroModelBudgetIssues',currentLimits:HERO_MODEL_BUDGET,before:{...metrics(before),issues:heroModelBudgetIssues(before)},after:{...metrics(after),issues:currentBudget},gateModified:false,toolPins:pins});
save('conversion.json',{schema:'ggd.cattiva.material-256-conversion@1',sourceRoot:source,outputPath:join(out,'body.glb'),outputSha256:sha(normalized.bytes),outputBytes:normalized.bytes.length,animationCount:33,jointCount:43,textureCount:5,textureMaxEdge:256,sourceProvidedMotionCount:33,proceduralMotionCount:0,originalUnrealAnimationAssetsAcquired:false,backendRegistration:'not-performed',gameplayAcceptance:'pending',limitations:['Downscaled image content differs from the retained high-resolution original; inspect target-game appearance.','All 33 source-supplied animations preserved. No Death clip or GGD six-state binding invented.','Same portable-material limitations as the high-resolution candidate: eye/mouth extra alpha cutoff/depth bias and facial UV switching not represented; no tangent in source.']});
console.log(JSON.stringify({outputPath:join(out,'body.glb'),sha256:sha(normalized.bytes),bytes:normalized.bytes.length,normalization:normalized.report,metrics:metrics(after),budget:currentBudget},null,2));
