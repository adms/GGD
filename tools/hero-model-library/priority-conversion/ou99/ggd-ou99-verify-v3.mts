import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync}from'node:fs';
import{join,dirname,resolve}from'node:path';import{createHash,randomUUID}from'node:crypto';import{createRequire}from'node:module';
const workspace='/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT',repo=join(workspace,'GGD-hero-model-options'),out=join(workspace,'outputs/priority-ou99-standards-v3-20260910');
const {inspectModelUpload}=await import(join(repo,'packages/shared/src/content/modelUpload/inspect.ts'));
const {prepareUploadedHeroModel,verifyUploadedHeroModel,heroModelBudgetIssues}=await import(join(repo,'packages/shared/src/content/modelUpload/heroModel.ts'));
const {ModelVersions}=await import(join(repo,'apps/content-api/src/modelVersions.ts'));
const {zModelVersionCommand}=await import(join(repo,'packages/shared/src/content/schema/championModelVersions.ts'));
const {effectiveYawOffsetDeg}=await import(join(repo,'packages/shared/src/content/glbYaw.ts'));
const {zModelDoc}=await import(join(repo,'packages/shared/src/content/schema/model.ts'));
const req=createRequire(join(repo,'packages/shared/package.json')),validator=req('gltf-validator');
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),put=(p:string,d:any)=>writeFileSync(p,JSON.stringify(d,null,2)+'\n',{flag:'wx'}),sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const manifest=read(join(out,'conversion-manifest.json')),workflow=read(join(repo,'materials/hero-model-library/workflow-model-options.json'));
const stage=join(out,'backend-prepare-content');mkdirSync(stage);for(const sub of ['champions','models'])mkdirSync(join(stage,sub));
function copyModel(key:string){
 const original=join(repo,'content/models',key+'.json'),target=join(stage,'models',key+'.json');if(existsSync(target))return;
 const d=read(original);copyFileSync(original,target);const dest=join(stage,d.glbPath);mkdirSync(dirname(dest),{recursive:true});copyFileSync(join(repo,'content',d.glbPath),dest);
}
const service=new ModelVersions(stage),results:any[]=[];
for(const row of manifest.models){
 const result:any={heroId:row.heroId,runtimeHeroId:row.runtimeHeroId,sourceId:row.sourceId,originalModelKey:row.sourceModelKey,modelKey:row.modelKey,directory:row.directory,runtime:row.runtime,priorError:row.error};
 try{
  assert.equal(row.status,'conversion-ready');const directory=row.directory,runtime=row.runtime;mkdirSync(runtime);
  const candidate=new Uint8Array(readFileSync(join(directory,'converted/body.glb'))),inspection=await inspectModelUpload(candidate),doc=read(join(directory,'original/model.json'));
  const selections=Object.fromEntries(Object.entries(doc.clipMap).map(([state,name])=>[state,inspection.clips.findIndex((c:any)=>c.name===name)]));
  const body=await prepareUploadedHeroModel(candidate,selections,effectiveYawOffsetDeg(doc));await verifyUploadedHeroModel(body.model,body.bytes);
  const document=zModelDoc.parse({...doc,id:row.modelKey,glbPath:`assets/models/community/${body.model.sha256}.glb`});
  assert.deepEqual(document.clipMap,doc.clipMap);assert.equal(document.scale,doc.scale);assert.equal(document.collisionRadius,doc.collisionRadius);
  writeFileSync(join(runtime,'body.glb'),body.bytes,{flag:'wx'});put(join(runtime,'model.json'),document);put(join(runtime,'uploaded-model.json'),body.model);put(join(runtime,'uploaded-document.json'),body.document);
  const receipt={schema:'ggd-library-body-ready@1',preparation:read(join(directory,'converted/preparation.receipt.json')),model:body.model,document,uploadedDocument:body.document,selectedClips:doc.clipMap,metrics:{triangles:body.inspected.triangles,drawPrimitives:body.inspected.meshes,textures:body.inspected.textures},runtimeClips:body.inspected.clips,warnings:body.warnings,validator:body.inspected.report,evidence:{sharedPrepareAndVerify:true,originalModelBindingPreservedExceptIdAndPath:true,nativeMotionNotResampled:true,visualAcceptance:'pending'}};put(join(runtime,'receipt.json'),receipt);
  const full=await validator.validateBytes(body.bytes,{uri:'body.glb',maxIssues:0,writeTimestamp:false,externalResourceFunction:async()=>{throw Error('External resources forbidden')}});assert.equal(full.issues.numErrors,0);assert.equal(full.issues.truncated,false);put(join(runtime,'khronos-unlimited.json'),full);
  const hf=join(repo,'content/champions',row.runtimeHeroId+'.json'),hero=read(hf);const htarget=join(stage,'champions',row.runtimeHeroId+'.json');if(!existsSync(htarget))copyFileSync(hf,htarget);
  copyModel(hero.modelKey);for(const version of hero.modelVersions??[])copyModel(version.modelKey);
  put(join(stage,'models',document.id+'.json'),document);const asset=join(stage,document.glbPath);mkdirSync(dirname(asset),{recursive:true});writeFileSync(asset,body.bytes,{flag:'wx'});
  const option=workflow.heroes.find((h:any)=>h.id===row.heroId)?.options.find((o:any)=>o.sourceId===row.sourceId);
  if(!option)throw Error('Missing current source provenance option');
  const state=service.state(row.runtimeHeroId),command=zModelVersionCommand.parse({action:'register',expectedHash:state.expectedHash,sourceModelKey:document.id,label:option.label+'（標準化 v3）',source:option.source,automaticEligible:option.source.kind!=='style-proxy'});
  const prepared=await service.prepare(row.runtimeHeroId,command);
  put(join(runtime,'backend-prepare-receipt.json'),{schema:'ggd-backend-model-version-prepare@1',method:'Actual ModelVersions.prepare against isolated byte copies of current hero, old model versions and candidate; writeArtifacts never called',stageRoot:stage,sourceHeroFile:hf,sourceHeroSha256:sha(readFileSync(hf)),command,preparedChampion:prepared.champion,artifacts:prepared.artifacts.map((a:any)=>({document:a.doc,version:a.version,bytes:a.bytes.length,sha256:sha(a.bytes)})),centralWrites:false,backendWrites:false});
  result.status='backend-prepare-passed';result.sha256=body.model.sha256;result.bytes=body.bytes.length;result.metrics=receipt.metrics;result.clipMap=document.clipMap;result.clips=body.inspected.clips;result.warnings=body.warnings;result.validator={errors:full.issues.numErrors,warnings:full.issues.numWarnings,infos:full.issues.numInfos,truncated:full.issues.truncated};result.versionCount=prepared.champion.modelVersions?.length;
 }catch(error){result.status='blocked';result.error=String(error)}
 results.push(result);console.log(JSON.stringify({modelKey:result.modelKey,status:result.status,triangles:result.metrics?.triangles,drawPrimitives:result.metrics?.drawPrimitives,error:result.error}));
}
put(join(out,'backend-validation-manifest.json'),{schema:'ggd-ou99-backend-validated@2',sourceCommit:manifest.sourceCommit,localRoot:out,passed:results.filter(r=>r.status==='backend-prepare-passed').length,blocked:results.filter(r=>r.status==='blocked').length,models:results});copyFileSync('/private/tmp/ggd-ou99-verify-v3.mts',join(out,'tools/ggd-ou99-verify-v3.mts'));
