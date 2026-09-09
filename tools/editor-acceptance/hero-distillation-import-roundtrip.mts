// Real loopback Main importer, pinned source/content, isolated work storage.
// No publication, official apply, source repair, or game-success claim.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash, randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {assetReader} from './hero-distillation-package-admission.mts';

const script=fileURLToPath(import.meta.url);
const hash=(bytes:any)=>createHash('sha256').update(bytes).digest('hex');
const read=(file:string)=>JSON.parse(fs.readFileSync(file,'utf8'));
const save=(file:string,value:any)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});

export function verifyRuntime(compiled:any[],expected:any[]){
  const actual=new Map(compiled.map(d=>[d.path,d.document]));
  const wanted=new Map(expected.map(d=>[`compiled/${d.collection}/${d.id}.json`,d.document]));
  assert.equal(actual.size,compiled.length,'DUPLICATE_IMPORTED_RUNTIME');
  assert.equal(wanted.size,expected.length,'DUPLICATE_ADMITTED_RUNTIME');
  assert.deepEqual(actual,wanted,'IMPORTED_RUNTIME_DIFFERS_FROM_ADMISSION');
  return actual.size;
}

export async function verifySaved(options:any){
  const admitted=path.resolve(options.admitted),imported=path.resolve(options['verify-saved-runtime']),out=path.resolve(options.out);
  assert(!fs.existsSync(out),'REFUSE_OVERWRITE_OR_RETRY');
  const aBytes=fs.readFileSync(path.join(admitted,'report.json')),iBytes=fs.readFileSync(path.join(imported,'report.json'));
  const a=JSON.parse(aBytes.toString()),i=JSON.parse(iBytes.toString());
  assert.equal(i.schema,'ggd-distillation-import-roundtrip@1');assert.equal(i.admittedReportSha256,hash(aBytes));
  assert.deepEqual(i.rows.map((r:any)=>r.id),a.rows.map((r:any)=>r.id),'IMPORTED_CASE_ORDER_DRIFT');
  const rows=[];
  for(let n=0;n<i.rows.length;n++){
    const item=i.rows[n],source=a.rows[n];
    const row:any={id:item.id,runtimeMatchesAdmission:null};rows.push(row);
    if(!item.liveImportPassed){row.status='not-measured';continue;}
    try{
      assert(/^[a-f0-9]{40}$/.test(item.engineRevision));assert(/^case-\d{4}\.json$/.test(source.artifact));
      const modulePath='packages/shared/src/content/import/readPackageZip.ts';
      const local=path.join(imported,'service-'+item.engineRevision,'source',modulePath);
      const original=execFileSync('git',['show',item.engineRevision+':'+modulePath],{cwd:path.resolve(options['source-repo']),maxBuffer:16*1024*1024});
      assert.equal(hash(fs.readFileSync(local)),hash(original),'ZIP_READER_SOURCE_DRIFT');
      const reader=await import(pathToFileURL(local).href);
      const archive=fs.readFileSync(path.join(imported,source.artifact.replace('.json',''),'hero.zip'));
      assert.equal(hash(archive),item.archiveSha256,'SAVED_ARCHIVE_DRIFT');
      const artifact=fs.readFileSync(path.join(admitted,source.artifact));assert.equal(hash(artifact),source.artifactSha256,'ADMISSION_ARTIFACT_DRIFT');
      row.runtimeDocuments=verifyRuntime(reader.readPackageZip(new Uint8Array(archive)).compiled,JSON.parse(artifact.toString()).runtime);
      Object.assign(row,{runtimeMatchesAdmission:true,status:'runtime-identical',archiveSha256:hash(archive)});
    }catch(error){Object.assign(row,{runtimeMatchesAdmission:false,status:'runtime-verification-failed',error:String(error)});}
  }
  const report={schema:'ggd-distillation-import-runtime-audit@1',admittedReportSha256:hash(aBytes),importReportSha256:hash(iBytes),
    scriptSha256:hash(fs.readFileSync(script)),rows,counts:{wholeHeroes:rows.length,identical:rows.filter(r=>r.runtimeMatchesAdmission===true).length,
      failed:rows.filter(r=>r.runtimeMatchesAdmission===false).length,unmeasured:rows.filter(r=>r.runtimeMatchesAdmission===null).length},
    fullHeroE2EProven:false,modelPromoted:false,scope:'Offline comparison of retained import ZIP runtime against pre-import package admission. No new HTTP calls or retries; not semantic or match proof.'};
  fs.mkdirSync(out,{recursive:true});save(path.join(out,'report.json'),report);return report;
}

export function linkDependencies(root:string,apiDeps:string,sharedDeps:string){
  // Never resolve @ggd/shared into a different worktree's mutable source.
  const destination=path.join(root,'node_modules');fs.mkdirSync(destination);
  const versions:Record<string,any>={};
  for(const supplied of [apiDeps,sharedDeps]){
    const base=fs.realpathSync(supplied);
    for(const entry of fs.readdirSync(base)){
      if(entry.startsWith('.')||entry==='@ggd')continue;
      const names=entry.startsWith('@')?fs.readdirSync(path.join(base,entry)).map(n=>entry+'/'+n):[entry];
      for(const name of names){
        const source=fs.realpathSync(path.join(base,name));
        const pkg=read(path.join(source,'package.json'));
        if(versions[name]){assert.equal(versions[name].version,pkg.version,'DEPENDENCY_VERSION_CONFLICT:'+name);continue;}
        const dest=path.join(destination,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.symlinkSync(source,dest,'dir');
        versions[name]={version:pkg.version,packageJsonSha256:hash(fs.readFileSync(path.join(source,'package.json')))};
      }
    }
  }
  fs.mkdirSync(path.join(destination,'@ggd'));
  fs.symlinkSync(path.join(root,'packages/shared'),path.join(destination,'@ggd/shared'),'dir');
  assert.equal(fs.realpathSync(path.join(destination,'@ggd/shared')),fs.realpathSync(path.join(root,'packages/shared')));
  return versions;
}

export async function startService(repo:string,revision:string,out:string,apiDeps:string,sharedDeps:string){
  assert(/^[a-f0-9]{40}$/.test(revision),'EXACT_ENGINE_REVISION_REQUIRED');
  const root=path.join(out,'source');fs.mkdirSync(root,{recursive:true});
  const paths=['package.json','tsconfig.base.json','pnpm-lock.yaml','pnpm-workspace.yaml','packages/shared','apps/content-api',
    'apps/editor/src/export-center/exportPolicy.ts','apps/editor/src/export-center/editorContractIndex.ts',
    'docs/editor-contract/ggd-presentation-token-manifest.json','tools/skill-remake',
    'tools/parallel-gates/sync-io.json','tools/parallel-gates/normalizers.json','skill-tag-manifest.json','content'];
  const archive=execFileSync('git',['archive','--format=tar',revision,...paths],{cwd:repo,maxBuffer:512*1024*1024,timeout:120000});
  execFileSync('tar',['-xf','-','-C',root],{input:archive,timeout:120000});
  const evidence={revision,sourceArchiveSha256:hash(archive),sourceArchiveBytes:archive.length,
    dependencies:linkDependencies(root,apiDeps,sharedDeps),contentManifestSha256:hash(fs.readFileSync(path.join(root,'content/manifest.json'))),
    storage:path.join(out,'work-storage'),overlay:'none: isolated pinned base catalog, not a live platform snapshot'};
  const load=(file:string)=>import(pathToFileURL(path.join(root,file)).href);
  const [serverModule,auth,source,zip,reader,policy,model,builders]=await Promise.all([
    'apps/content-api/src/heroImportServer.ts','packages/shared/src/content/node/heroImportAuth.ts',
    'packages/shared/src/content/import/heroSourcePackage.ts','packages/shared/src/content/import/packageZip.ts',
    'packages/shared/src/content/import/readPackageZip.ts','apps/editor/src/export-center/exportPolicy.ts',
    'packages/shared/src/content/modelUpload/heroModelSchema.ts',
    'packages/shared/src/content/import/heroBuildSources.ts'].map(load));
  // Main's own source snapshot must succeed before any hero is attempted.
  const generatorSnapshot=builders.snapshotHeroGenerator(root),processorSnapshot=builders.snapshotHeroProcessor(root);
  save(path.join(out,'source-evidence.json'),{...evidence,buildSources:{
    generatorVersionId:generatorSnapshot.versionId,processorVersionId:processorSnapshot.versionId,
    processorFingerprint:processorSnapshot.processorFingerprint}});
  // Disposable service authentication exists only in this process's memory.
  // It is not an AWS credential or an existing service/account credential.
  const secret=randomBytes(32).toString('hex');
  const app=serverModule.buildHeroImportServer({repoRoot:root,contentDir:path.join(root,'content'),
    importDir:evidence.storage,gameVersion:revision,secret,logger:false});
  try{
    const origin=await app.listen({host:'127.0.0.1',port:0});
    assert.equal(new URL(origin).hostname,'127.0.0.1');
    async function request(route:string,body?:Uint8Array,identity?:Record<string,string>){
      assert(route.startsWith('/')&&!route.includes('?')&&!route.includes('..'),'UNSAFE_ROUTE');
      const target=auth.HERO_IMPORT_PREFIX+route,method=body?'POST':'GET';
      let res:Response;
      try{res=await fetch(origin+target,{method,redirect:'error',signal:AbortSignal.timeout(90000),
        headers:{...auth.heroImportHeaders(secret,method,target,body,identity),...(body?{'content-type':'application/zip'}:{})},
        body:body?Buffer.from(body):undefined});}
      catch(error:any){throw new Error(`IMPORT_TRANSPORT_FAILURE:${method}:${route}:${error?.name}:${error?.cause?.code??'unknown'}`);}
      assert(res.ok,`IMPORT_HTTP_${res.status}:${route}:`+(res.ok?'':await res.text()));
      return res;
    }
    const profile=await(await request('/active/target-profile')).json();
    const facts=policy.readTargetProfileFacts(profile);
    assert.equal(facts.gameRevision,revision,'IMPORT_ENGINE_DRIFT');
    assert(facts.contentVersion&&facts.migrationFingerprint&&facts.authoringProcessorFingerprint,'INCOMPLETE_TARGET');
    const target={gameRevision:facts.gameRevision,contentVersion:facts.contentVersion,
      migrationFingerprint:facts.migrationFingerprint,processorFingerprint:facts.authoringProcessorFingerprint};
    save(path.join(out,'target-profile.json'),profile);
    return {app,origin,request,source,zip,reader,model,target,evidence};
  }catch(error){await app.close();throw error;}
}

export async function roundtrip(service:any,project:any,assets:ReturnType<typeof assetReader>,out:string){
  const model=project.presentation.uploadedModel;
  const modelBytes=model?assets.readAsset(service.model.uploadedHeroModelPath(model)):undefined;
  assert(!model||modelBytes,'MODEL_BYTES_MISSING');
  const source=service.source.buildHeroSourcePackage(project,[],service.target,modelBytes);
  const sourceZip=(await service.zip.buildRuntimePackageZip(service.zip.packageZipInput(source,project.projectId))).bytes;
  const built=new Uint8Array(await(await service.request('/hero-package',sourceZip)).arrayBuffer());
  const inspection=await(await service.request('/inspect-hero-package',built)).json();
  const identity={'x-ggd-work-id':project.projectId,'x-ggd-operation-id':`forge-${hash(built).slice(0,24)}`};
  const stored=await(await service.request('/prepare-work',built,identity)).json();
  assert.equal(stored.status,'stored');
  const route=`/work-versions/${encodeURIComponent(project.projectId)}/${encodeURIComponent(stored.version.versionId)}`;
  const detail=await(await service.request(route)).json();
  const downloaded=new Uint8Array(await(await service.request(route+'/package')).arrayBuffer());
  assert.deepEqual(detail.project,project,'IMPORTED_SOURCE_CHANGED');
  assert.deepEqual(downloaded,built,'DOWNLOADED_ARCHIVE_CHANGED');
  const restored=service.reader.readPackageZip(downloaded);
  assert.equal(restored.manifest.packageDigest,inspection.packageDigest,'PACKAGE_DIGEST_DRIFT');
  assert(restored.compiled.length&&restored.validation.length,'SOURCE_ONLY_NOT_COMPILED');
  assert.deepEqual(restored.documents.find((d:any)=>d.path===`authoring/hero-projects/${project.projectId}.json`)?.document,project);
  if(model)assert.deepEqual(restored.assets.find((a:any)=>a.path===service.model.uploadedHeroModelPath(model))?.bytes,modelBytes);
  fs.mkdirSync(out);
  fs.writeFileSync(path.join(out,'hero.zip'),built,{flag:'wx'});
  save(path.join(out,'inspection.json'),inspection);save(path.join(out,'stored-version.json'),stored.version);
  return {packageDigest:inspection.packageDigest,archiveSha256:hash(built),archiveBytes:built.length,
    compiledDocuments:restored.compiled.length,validationDocuments:restored.validation.length,
    sourceUnchanged:true,downloadIdentical:true,modelBytesUnchanged:model?true:null};
}

export async function run(options:any){
  const input=path.resolve(options.admitted),out=path.resolve(options.out);
  assert(!fs.existsSync(out),'REFUSE_OVERWRITE_OR_RETRY');
  const raw=fs.readFileSync(path.join(input,'report.json')),admitted=JSON.parse(raw.toString());
  assert.equal(admitted.schema,'ggd-distillation-package-admission@1');
  assert.equal(admitted.rows.length,admitted.counts.wholeHeroes);
  fs.mkdirSync(out,{recursive:true});
  const report:any={schema:'ggd-distillation-import-roundtrip@1',admittedReportSha256:hash(raw),
    sourceEvidence:admitted.sourceEvidence,scriptSha256:hash(fs.readFileSync(script)),rows:[],services:{},
    scope:'Pinned Main HTTP build, inspect, immutable isolated storage and download. No platform publication, hero selection, game behavior or model readiness.',
    fullHeroE2EProven:false,modelPromoted:false};
  const services=new Map<string,any>(),serviceFailures=new Map<string,string>();
  try{
    for(const item of admitted.rows){
      const row:any={id:item.id,heroId:item.heroId,engineRevision:item.engineRevision,liveImportPassed:false,fullHeroE2EProven:false};report.rows.push(row);
      if(!item.packageAdmissionPassed){row.status=item.status==='native-import-bridge-pending'?'native-import-bridge-pending':'blocked-by-package-admission';continue;}
      try{
        assert(/^case-\d{4}\.json$/.test(item.artifact),'UNSAFE_ARTIFACT_PATH');
        const bytes=fs.readFileSync(path.join(input,item.artifact));assert.equal(hash(bytes),item.artifactSha256,'ARTIFACT_DRIFT');
        const artifact=JSON.parse(bytes.toString());
        assert(!serviceFailures.has(item.engineRevision),'SERVICE_START_PREVIOUSLY_FAILED:'+serviceFailures.get(item.engineRevision));
        let service=services.get(item.engineRevision);
        if(!service){try{service=await startService(path.resolve(options['source-repo']),item.engineRevision,
          path.join(out,'service-'+item.engineRevision),path.resolve(options['api-dependencies']),path.resolve(options.dependencies));}
          catch(error){serviceFailures.set(item.engineRevision,String(error));throw error;}
          services.set(item.engineRevision,service);report.services[item.engineRevision]={target:service.target,origin:service.origin};}
        const assets=assetReader(options['asset-root']);
        Object.assign(row,await roundtrip(service,artifact.project,assets,path.join(out,item.artifact.replace('.json',''))),
          {liveImportPassed:true,status:'isolated-import-roundtrip-pass',assets:assets.evidence});
      }catch(error){row.status=serviceFailures.has(item.engineRevision)?'service-unavailable-not-model-failure':'import-failed';row.error=String(error);}
    }
  }finally{
    await Promise.all([...services.values()].map(s=>s.app.close()));
    report.counts={wholeHeroes:admitted.rows.length,liveImportPassed:report.rows.filter((r:any)=>r.liveImportPassed).length,
      failed:report.rows.filter((r:any)=>r.status==='import-failed').length,
      serviceUnavailable:report.rows.filter((r:any)=>r.status==='service-unavailable-not-model-failure').length};
    save(path.join(out,'report.json'),report);
  }
  return report;
}

if(process.argv[1]&&path.resolve(process.argv[1])===script){
  const {values}=parseArgs({options:Object.fromEntries(['admitted','out','source-repo','api-dependencies','dependencies','verify-saved-runtime'].map(k=>[k,{type:'string'}]).concat([['asset-root',{type:'string',multiple:true}]])) as any});
  for(const key of ['admitted','out','source-repo'])assert(values[key],'MISSING:'+key);
  if(values['verify-saved-runtime'])console.log(JSON.stringify((await verifySaved(values)).counts));
  else{
    for(const key of ['api-dependencies','dependencies','asset-root'])assert(values[key],'MISSING:'+key);
    console.log(JSON.stringify((await run(values)).counts));
  }
}
