import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {inflateRawSync} from 'node:zlib';
const root=path.dirname(new URL(import.meta.url).pathname);
const repo=process.cwd();
const use=(p:string)=>import(pathToFileURL(path.join(repo,p)).href);
const {readPackageZip}=await use('packages/shared/src/content/import/readPackageZip.ts');
const {buildHeroSourcePackage}=await use('packages/shared/src/content/import/heroSourcePackage.ts');
const {buildRuntimePackageZip,packageZipInput,binarySha256}=await use('packages/shared/src/content/import/packageZip.ts');
const {snapshotHeroGenerator}=await use('packages/shared/src/content/import/heroBuildSources.ts');
const {adoptHeroGenerator}=await use('apps/editor/src/hero/projectModel.ts');
const {readTargetProfileFacts}=await use('apps/editor/src/export-center/exportPolicy.ts');
const {uploadedHeroModelPath}=await use('packages/shared/src/content/modelUpload/heroModelSchema.ts');
const {contentSha256}=await use('packages/shared/src/content/import/jcs.ts');
const oldIndex=path.join(path.dirname(repo),'outputs/community-hero-asset-integration/editor-publication-20260907/generator-rebuild/current-package-audit.json');
const input=JSON.parse(await fs.readFile(oldIndex,'utf8'));
assert.equal(input.heroCount,37);assert.equal(input.slotCount,222);
const out=path.join(root,'rebuilt-37');
await fs.mkdir(out); // Never overwrite a prior attempt.
const password=JSON.parse(await fs.readFile(path.join(root,'credentials-private.json'),'utf8')).password;
let token='';
async function api(route:string,body?:unknown){
 const bytes=body instanceof Uint8Array;
 const r=await fetch('http://127.0.0.1:8097/api/v1'+route,{method:body===undefined?'GET':'POST',headers:{...(token?{authorization:`Bearer ${token}`} : {}),...(body===undefined?{}:{'content-type':bytes?'application/zip':'application/json'})},body:body===undefined?undefined:bytes?body as Uint8Array:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
 if(!r.ok)throw new Error(`${route}: HTTP ${r.status} ${await r.text()}`);
 return r;
}
const login=await(await api('/auth/login',{username:'model-author',password})).json();token=login.tokens.accessToken;
const profile=await(await api('/hero-import/target-profile')).json();
const facts=readTargetProfileFacts(profile);
const target={gameRevision:facts.gameRevision,contentVersion:facts.contentVersion,migrationFingerprint:facts.migrationFingerprint,processorFingerprint:facts.authoringProcessorFingerprint};
assert(Object.values(target).every(Boolean));
const generator=snapshotHeroGenerator(repo).versionId;
const report:any={schema:'ggd-current-service-batch-proof@1',startedAt:new Date().toISOString(),status:'running',scope:'Editor generator-adoption function plus authenticated current-service compilation and inspection. Does not prove UI submission or original-art fidelity.',oldIndex,target,generatorVersion:generator,rows:[]};
const save=()=>fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
await fs.writeFile(path.join(out,'target-profile.json'),JSON.stringify(profile,null,2)+'\n');
for(const row of input.rows){
 const item:any={number:row.number,name:row.name,status:'running'};report.rows.push(item);
 try{
  const oldBytes=new Uint8Array(await fs.readFile(row.archive));
  assert.equal(await binarySha256(oldBytes),row.archiveSha256);
  const old=readPackageZip(oldBytes,{inflate:(b:Uint8Array,maxBytes:number)=>new Uint8Array(inflateRawSync(b,{maxOutputLength:maxBytes}))});
  const original=old.documents.find((x:any)=>x.path.startsWith('authoring/hero-projects/'))?.document;
  assert(original?.acceptedPlan && original.sourceDesign && original.presentation.uploadedModel);
  assert.equal(original.brief.name,row.name);
  const project=adoptHeroGenerator(structuredClone(original),generator);
  assert.equal(project.revision,original.revision+1);
  for(const key of ['brief','sourceLock','sourceDesign','refinementNotes','presentation'])assert.deepEqual(project[key],original[key],`Preserve ${key}`);
  assert.deepEqual(project.acceptedPlan,{...original.acceptedPlan,generatorVersion:generator});
  const model=original.presentation.uploadedModel;
  const modelBytes=old.assets.find((x:any)=>x.path===uploadedHeroModelPath(model))?.bytes;assert(modelBytes);
  const icons=old.manifest.entries.filter((e:any)=>e.role==='asset' && e.targetField==='icon').map((e:any)=>({path:e.path,collection:e.collection,id:e.id,mime:e.mime,bytes:old.assets.find((a:any)=>a.path===e.path)!.bytes}));
  const source=buildHeroSourcePackage(project,icons,target,modelBytes);
  const sourceZip=(await buildRuntimePackageZip(packageZipInput(source,project.projectId))).bytes;
  const built=new Uint8Array(await(await api('/hero-import/build',sourceZip)).arrayBuffer());
  const current=readPackageZip(built,{inflate:(b:Uint8Array,maxBytes:number)=>new Uint8Array(inflateRawSync(b,{maxOutputLength:maxBytes}))});
  assert.deepEqual(current.documents.find((x:any)=>x.path.startsWith('authoring/hero-projects/'))?.document,project);
  assert.deepEqual(current.assets.find((x:any)=>x.path===uploadedHeroModelPath(model))?.bytes,modelBytes);
  assert.equal(current.assets.length,old.assets.length);
  for(const asset of old.assets)assert.deepEqual(current.assets.find((x:any)=>x.path===asset.path)?.bytes,asset.bytes);
  assert(current.compiled.length>0 && current.validation.length>0);
  assert.equal(current.manifest.base.gameRevision,target.gameRevision);assert.equal(current.manifest.base.contentVersion,target.contentVersion);
  const inspection=await(await api('/hero-import/inspect',built)).json();
  const dir=path.join(out,String(row.number).padStart(2,'0'));await fs.mkdir(dir);
  await fs.writeFile(path.join(dir,'package.zip'),built);
  await fs.writeFile(path.join(dir,'before.hero-project.json'),JSON.stringify(original,null,2)+'\n');
  await fs.writeFile(path.join(dir,'after.hero-project.json'),JSON.stringify(project,null,2)+'\n');
  await fs.writeFile(path.join(dir,'inspection.json'),JSON.stringify(inspection,null,2)+'\n');
  await fs.writeFile(path.join(dir,'validation.json'),JSON.stringify(current.validation,null,2)+'\n');
  Object.assign(item,{status:'passed',projectId:project.projectId,revision:project.revision,archive:path.join(dir,'package.zip'),archiveSha256:await binarySha256(built),packageDigest:current.manifest.packageDigest,sourceDigest:contentSha256(project),sourceDesignDigest:contentSha256(project.sourceDesign),templateVersions:Object.keys(project.acceptedPlan.templateVersions??{}).length,fullOriginalTextPreserved:true,allSlotsAndRefinementsPreserved:true,modelAndIconBytesPreserved:true,modelSha256:model.sha256,compiledDocuments:current.compiled.length,validationDocuments:current.validation.length,assets:current.assets.length,archiveBytes:built.length});
 }catch(error){Object.assign(item,{status:'failed',error:error instanceof Error?error.message:String(error)});}
 await save();console.log(JSON.stringify(item));
}
const after=readTargetProfileFacts(await(await api('/hero-import/target-profile')).json());
assert.deepEqual({gameRevision:after.gameRevision,contentVersion:after.contentVersion,migrationFingerprint:after.migrationFingerprint,processorFingerprint:after.authoringProcessorFingerprint},target);
report.passed=report.rows.filter((x:any)=>x.status==='passed').length;report.failed=37-report.passed;report.status=report.failed?'failed':'passed';report.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify({status:report.status,passed:report.passed,failed:report.failed,out}));if(report.failed)process.exitCode=1;
