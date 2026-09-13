import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {inspectModelUpload} from '../../../../packages/shared/src/content/modelUpload/inspect';
import {prepareUploadedHeroModel,verifyUploadedHeroModel} from '../../../../packages/shared/src/content/modelUpload/heroModel';
import {resizeImageWithFfmpeg} from '../../../../apps/content-api/src/resizeImage.node';
const [input,output]=process.argv.slice(2);assert(input&&output,'source.glb output-directory required');
const raw=new Uint8Array(readFileSync(resolve(input))),before=await inspectModelUpload(raw);
const states=['idle','run','attack','cast','hurt','death'] as const;
const selections=Object.fromEntries(states.map(state=>[state,before.clips.findIndex(c=>c.name==='GGD_procedural_'+state)]));
const prepared=await prepareUploadedHeroModel(raw,selections as any,0,{resizeImage:resizeImageWithFfmpeg});
const verified=await verifyUploadedHeroModel(prepared.model,prepared.bytes);
const require=createRequire(resolve('packages/shared/package.json')),validator=require('gltf-validator');
const validation=await validator.validateBytes(prepared.bytes,{uri:'body.glb',maxIssues:0,writeTimestamp:false,externalResourceFunction:async()=>{throw Error('External resource not allowed')}});
assert.equal(validation.issues.numErrors,0);assert.equal(validation.issues.truncated,false);
const out=resolve(output);mkdirSync(out);const put=(name:string,data:any)=>writeFileSync(join(out,name),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
writeFileSync(join(out,'body.glb'),prepared.bytes,{flag:'wx'});put('model.json',prepared.document);put('uploaded-model.json',prepared.model);put('khronos.json',validation);
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const receipt={schema:'ggd-kaiji-runtime-preparation@1',sourceSha256:sha(raw),sha256:sha(prepared.bytes),bytes:prepared.bytes.length,modelKey:prepared.document.id,clipMap:prepared.document.clipMap,nativeAnimations:0,proceduralAnimations:6,
 before:{triangles:before.triangles,drawPrimitives:before.meshes,textures:before.textures},after:{triangles:verified.inspected.triangles,drawPrimitives:verified.inspected.meshes,textures:verified.inspected.textures,clips:verified.inspected.clips},normalization:prepared.normalized,warnings:prepared.warnings,
 sharedPreparePassed:true,sharedVerifyPassed:true,khronos:{errors:validation.issues.numErrors,warnings:validation.issues.numWarnings,infos:validation.issues.numInfos},rendered:false,centralWrites:false};
put('receipt.json',receipt);console.log(JSON.stringify(receipt));
