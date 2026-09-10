/** Invoke unchanged GGD normalizer, resizer, upload validation and budget. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const [repoArg,rootArg]=process.argv.slice(2);if(!rootArg)throw Error('usage: normalize_validate.mts <GGD repo with dependencies> <conversion root>');
const repo=resolve(repoArg),root=resolve(rootArg),out=join(root,'outputs');mkdirSync(out,{recursive:false});
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const save=(p:string,d:unknown)=>writeFileSync(p,JSON.stringify(d,null,2)+'\n',{flag:'wx'});
const imp=(p:string)=>import(pathToFileURL(join(repo,p)).href);
const [{normalizeUploadedModel},{inspectModelUpload},{resizeImageWithFfmpeg},{heroModelBudgetIssues},{HERO_MODEL_BUDGET},{MODEL_UPLOAD_LIMITS}]=await Promise.all([
imp('packages/shared/src/content/modelUpload/normalize.ts'),imp('packages/shared/src/content/modelUpload/inspect.ts'),imp('apps/content-api/src/resizeImage.node.ts'),imp('packages/shared/src/content/modelUpload/heroModel.ts'),imp('packages/shared/src/content/modelUpload/budget.ts'),imp('packages/shared/src/content/modelUpload/glb.ts')]);
const pins=['packages/shared/src/content/modelUpload/normalize.ts','packages/shared/src/content/modelUpload/inspect.ts','packages/shared/src/content/modelUpload/glb.ts','packages/shared/src/content/modelUpload/heroModel.ts','packages/shared/src/content/modelUpload/budget.ts','apps/content-api/src/resizeImage.node.ts'].map(path=>({path,sha256:sha(readFileSync(join(repo,path)))}));
const results=[];const dim:Record<string,number>={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
function bytesOf(model:any,i:number){const a=model.json.accessors[i];assert.equal(a.componentType,5126);assert.ok(!a.sparse);const v=model.json.bufferViews[a.bufferView],width=dim[a.type]*4,base=(v.byteOffset??0)+(a.byteOffset??0),stride=v.byteStride??width,b=Buffer.alloc(a.count*width);for(let j=0;j<a.count;j++)b.set(model.bin.subarray(base+j*stride,base+j*stride+width),j*width);return b;}
for(const prop of ['handheld','back']){
 const inputPath=join(root,'intermediate',prop,'source-materials.glb'),input=readFileSync(inputPath),before=await inspectModelUpload(new Uint8Array(input));
 const normalized=await normalizeUploadedModel(new Uint8Array(input),{maxTextureEdge:HERO_MODEL_BUDGET.texEdge.limit,resizeImage:resizeImageWithFfmpeg});
 const after=await inspectModelUpload(normalized.bytes),budget=heroModelBudgetIssues(after);assert.deepEqual(budget.errors,[]);assert.equal(after.triangles,1854);assert.equal(after.meshes,2);assert.equal(after.clips.length,0);assert.equal(after.json.skins?.length??0,0);assert.equal(after.json.nodes?.length,1);assert.equal(after.textures.length,7);assert.ok(after.textures.every((t:any)=>t.width<=HERO_MODEL_BUDGET.texEdge.limit&&t.height<=HERO_MODEL_BUDGET.texEdge.limit));
 for(const k of ['nodes','meshes','accessors','materials','textures','samplers','extensionsUsed','scene','scenes'])assert.deepEqual(after.json[k],before.json[k],k);
 const preserved=[];for(let i=0;i<before.json.accessors.length;i++){const a=bytesOf(before,i),b=bytesOf(after,i);assert.deepEqual(a,b,`accessor ${i}`);preserved.push({index:i,bytes:b.length,sha256:sha(b),unchanged:true});}
 const propOut=join(out,prop);mkdirSync(propOut);writeFileSync(join(propOut,'component.glb'),normalized.bytes,{flag:'wx'});
 const textures=after.json.images.map((im:any,index:number)=>{const v=after.json.bufferViews[im.bufferView],b=after.bin.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength),name=(im.name||'image-'+index)+(im.mimeType==='image/png'?'.png':'.jpg');writeFileSync(join(propOut,name),b,{flag:'wx'});return {name,...after.textures[index]};});
 const receipt={schema:'ggd.dai-rigid-prop-current-validation@1',prop,role:'independent-weapon-component',inputPath,inputSha256:sha(input),outputPath:join(propOut,'component.glb'),outputSha256:sha(normalized.bytes),outputBytes:normalized.bytes.length,triangles:after.triangles,drawPrimitives:after.meshes,nodeCount:after.json.nodes.length,skins:0,clips:[],textures,normalization:normalized.report,accessorPreservation:preserved,allAccessorBytesPreserved:true,materialJsonPreserved:true,uploadReport:after.report,budget,limits:{upload:MODEL_UPLOAD_LIMITS,hero:HERO_MODEL_BUDGET},toolPins:pins,nodeVersion:process.version,ffmpegVersion:execFileSync('ffmpeg',['-version'],{encoding:'utf8'}).split('\n')[0],contractRepository:repo,contractCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),heroModelPreparationPerformed:false,backendRegistrationPerformed:false,gameplayAcceptance:false,materialParity:'portable-PBR-approximation; Daz Iray source render parity not established'};
 save(join(propOut,'validation.json'),receipt);results.push(receipt);console.log(JSON.stringify({prop,sha256:receipt.outputSha256,bytes:receipt.outputBytes,triangles:receipt.triangles,drawPrimitives:receipt.drawPrimitives,textures:after.textures.length,errors:after.report.issues.numErrors,warnings:after.report.issues.numWarnings,budget}));
}
save(join(root,'evidence/current-contract-validation.json'),{schema:'ggd.dai-rigid-props-validation@1',props:results.map(r=>({prop:r.prop,path:r.outputPath,sha256:r.outputSha256,bytes:r.outputBytes,triangles:r.triangles,drawPrimitives:r.drawPrimitives,textureCount:r.textures.length,uploadReport:r.uploadReport,budget:r.budget})),contractPins:pins,fullyQualifiedHeroModels:0,backendRegistrations:0,defaultChanges:0});
