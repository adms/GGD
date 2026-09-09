// Read-only, CPU-only package admission of already materialized outputs.
// Uses Main's pinned compiler, asset validator and SimWorld admission, not a
// replacement rule engine. This is NOT a live importer or playable-hero receipt.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const script=fileURLToPath(import.meta.url);
const hash=(x:any)=>createHash('sha256').update(x).digest('hex');
const read=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8'));
const save=(p:string,x:any)=>fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n',{flag:'wx'});

export function assetReader(roots:string[]){
  const bases=roots.map(r=>fs.realpathSync(r)),evidence:Record<string,any>={};
  function readAsset(relative:string){
    assert(typeof relative==='string'&&relative.startsWith('assets/')&&!relative.includes('\\')&&
      relative.split('/').every(p=>p&&p!=='.'&&p!=='..'),'UNSAFE_ASSET_PATH');
    let answer:Uint8Array|undefined,digest:string|undefined;
    const sources:string[]=[];
    for(const root of bases){
      const candidate=path.join(root,relative);
      if(!fs.existsSync(candidate))continue;
      const resolved=fs.realpathSync(candidate);
      assert(resolved.startsWith(root+path.sep),'ASSET_SYMLINK_ESCAPE');
      assert(fs.statSync(resolved).isFile(),'ASSET_NOT_FILE');
      const bytes=fs.readFileSync(resolved),actual=hash(bytes);
      assert(!digest||digest===actual,'AMBIGUOUS_ASSET_BYTES:'+relative);
      answer=new Uint8Array(bytes);digest=actual;sources.push(resolved);
    }
    evidence[relative]={exists:!!answer,...(answer?{sha256:digest,bytes:answer.length,sources}:{})};
    return answer;
  }
  return {readAsset,evidence};
}

export function packageEngineLoader(repo:string,dependencies:string){
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'ggd-package-admission-')),
    cache=new Map<string,any>(),evidence:Record<string,any>={};
  const deps=fs.realpathSync(dependencies);
  for(const name of ['zod','gltf-validator'])assert(fs.existsSync(path.join(deps,name,'package.json')),'DEPENDENCY_MISSING:'+name);
  async function load(revision:string){
    if(cache.has(revision))return cache.get(revision);
    assert(/^[a-f0-9]{40}$/.test(revision),'EXACT_ENGINE_REVISION_REQUIRED');
    const files=execFileSync('git',['ls-tree','-r','--name-only',revision,'content'],{cwd:repo,encoding:'utf8'})
      .trim().split('\n').filter(p=>/^content\/[^/]+\/[^/]+\.json$/.test(p)&&!path.basename(p).startsWith('_')&&!p.startsWith('content/assets/'));
    assert(files.length>0,'EMPTY_PINNED_CATALOG');
    const root=path.join(base,revision);fs.mkdirSync(root);
    const archive=execFileSync('git',['archive','--format=tar',revision,'package.json','packages/shared/package.json','packages/shared/src',...files],
      {cwd:repo,maxBuffer:128*1024*1024});
    execFileSync('tar',['-xf','-','-C',root],{input:archive});
    fs.symlinkSync(deps,path.join(root,'packages/shared/node_modules'),'dir');
    const modules=['import/heroPackage.ts','modelUpload/heroModel.ts','modelUpload/heroModelSchema.ts'];
    const [pkg,upload,uploadSchema]=await Promise.all(modules.map(p=>import(pathToFileURL(path.join(root,'packages/shared/src/content',p)).href)));
    const documents=new Map<string,any>();
    for(const file of files){const d=read(path.join(root,file));if(typeof d.id==='string'){
      const key=file.split('/')[1]+'/'+d.id;assert(!documents.has(key),'DUPLICATE_PINNED_DOCUMENT:'+key);documents.set(key,d);
    }}
    const e={revision,pkg,upload,uploadSchema,documents};cache.set(revision,e);
    evidence[revision]={archiveSha256:hash(archive),archiveBytes:archive.length,documents:documents.size,
      dependencies:Object.fromEntries(['zod','gltf-validator'].map(n=>[n,read(path.join(deps,n,'package.json')).version])),
      modules:Object.fromEntries(modules.map(p=>[p,hash(fs.readFileSync(path.join(root,'packages/shared/src/content',p)))]))};
    return e;
  }
  return {load,evidence};
}

export async function admitProject(output:any,e:any,assets:ReturnType<typeof assetReader>){
  assert.equal(output.format,'hero-project','NATIVE_IMPORT_BRIDGE_PENDING');
  const project=structuredClone(output.project),before=JSON.stringify(project);
  const documents=new Map(e.documents),catalog:any={documents,readAsset:assets.readAsset};
  let verifiedModel:any=null;
  if(project.presentation?.uploadedModel){
    const model=project.presentation.uploadedModel,assetPath=e.uploadSchema.uploadedHeroModelPath(model);
    const bytes=assets.readAsset(assetPath);assert(bytes,'UPLOADED_MODEL_BYTES_MISSING:'+assetPath);
    const checked=await e.upload.verifyUploadedHeroModel(model,bytes);
    assert.equal(checked.document.id,project.presentation.modelKey,'MODEL_BINDING_MISMATCH');
    const key='models/'+checked.document.id;
    if(documents.has(key))assert.deepEqual(documents.get(key),checked.document,'MODEL_DOCUMENT_CONFLICT');
    documents.set(key,checked.document);
    catalog.validatedUploadedModel={projectId:project.projectId,model:checked.model};
    verifiedModel={assetPath,sha256:model.sha256,byteSize:bytes.length,clipMap:checked.model.clipMap,
      triangles:checked.inspected.triangles,meshes:checked.inspected.meshes,warnings:checked.warnings};
  }
  // Main validates exact source templates; submitted snapshots do not become
  // trusted history here. Unknown historic template revisions fail closed.
  const result=e.pkg.compileHeroPackageProject(project,catalog,true);
  assert.equal(JSON.stringify(project),before,'PACKAGE_COMPILER_MUTATED_SOURCE');
  return {result,verifiedModel};
}

export async function run(options:any){
  const input=path.resolve(options['--compiled']),out=path.resolve(options['--out']);
  assert(!fs.existsSync(out),'REFUSE_OVERWRITE');
  const bytes=fs.readFileSync(path.join(input,'report.json')),compiled=JSON.parse(bytes.toString());
  assert.equal(compiled.schema,'ggd-distillation-generation-compile@1');
  const whole=compiled.rows.map((r:any,i:number)=>({...r,index:i})).filter((r:any)=>r.slot==='HERO');
  assert.equal(whole.length,compiled.counts.primaryWholeHeroes,'WHOLE_DENOMINATOR_DRIFT');
  const loader=packageEngineLoader(path.resolve(options['--source-repo']),path.resolve(options['--dependencies']));
  fs.mkdirSync(out,{recursive:true});const rows:any[]=[];
  for(const source of whole){
    const row:any={id:source.id,heroId:source.heroId,engineRevision:source.engineRevision,
      packageAdmissionPassed:false,fullHeroE2EProven:false,humanRepairs:0};rows.push(row);
    if(!source.schemaCompilePassed||!source.diskReloadCompileIdentical){row.status='blocked-by-structural-generation';continue;}
    const assets=assetReader(options['--asset-root']);row.assets=assets.evidence;
    try{
      const authoring=fs.readFileSync(path.join(input,`case-${String(source.index).padStart(4,'0')}`,'authoring.json'));
      assert.equal(hash(authoring),source.authoringSha256,'AUTHORING_DRIFT');
      row.authoringSha256=hash(authoring);
      const output=JSON.parse(authoring.toString());
      if(output.format==='native-content'){row.status='native-import-bridge-pending';continue;}
      const e=await loader.load(source.engineRevision),{result,verifiedModel}=await admitProject(output,e,assets);
      const artifact={project:result.project,generated:result.generated,compiled:result.compiled,
        dependencies:result.dependencies,runtime:result.runtime,scenarios:result.scenarios,
        assets:result.assets.map(({path,bytes,contentSha256,mediaType}:any)=>({path,byteSize:bytes.length,contentSha256,mediaType}))};
      const file=`case-${String(source.index).padStart(4,'0')}.json`;save(path.join(out,file),artifact);
      Object.assign(row,{status:'package-admission-pass-not-live-import',packageAdmissionPassed:true,verifiedModel,
        artifact:file,artifactSha256:hash(fs.readFileSync(path.join(out,file))),dependencyCount:result.dependencies.length,
        runtimeDocuments:result.runtime.length,assetCount:result.assets.length,assetBytes:result.assets.reduce((n:number,a:any)=>n+a.bytes.length,0)});
    }catch(error:any){row.status='package-admission-failed';row.error=String(error);}
  }
  const report={schema:'ggd-distillation-package-admission@1',scriptSha256:hash(fs.readFileSync(script)),
    compiledReportSha256:hash(bytes),sourceEvidence:compiled.sourceEvidence,engines:loader.evidence,
    counts:{wholeHeroes:whole.length,packageAdmissionPassed:rows.filter(r=>r.packageAdmissionPassed).length,
      nativeBridgePending:rows.filter(r=>r.status==='native-import-bridge-pending').length,failed:rows.filter(r=>r.status==='package-admission-failed').length},
    scope:'Pinned Main package compiler, real GLB/clip/budget validation, transitive dependency/asset closure and built-in SimWorld admission. Read-only asset roots; no source repairs, no placeholder bytes, no ZIP/target-profile/live importer/game selection/behavior-fidelity certification. Native-content cases stay in the denominator but require a separate native import bridge.',
    fullHeroE2EProven:false,modelPromoted:false,rows};save(path.join(out,'report.json'),report);return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===script){
  const args=process.argv.slice(2),options:any={'--asset-root':[]};
  while(args.length){const key=args.shift()!;assert(['--compiled','--out','--source-repo','--dependencies','--asset-root'].includes(key)&&args.length,'UNKNOWN_OR_MISSING_ARGUMENT');
    if(key==='--asset-root')options[key].push(args.shift());else{assert(!options[key],'DUPLICATE_ARGUMENT');options[key]=args.shift();}}
  for(const key of ['--compiled','--out','--source-repo','--dependencies'])assert(options[key],'MISSING:'+key);
  assert(options['--asset-root'].length,'ASSET_ROOT_REQUIRED');console.log(JSON.stringify((await run(options)).counts));
}
