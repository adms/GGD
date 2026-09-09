// CPU-only audit: can the frozen native outputs use a newer packaging engine
// without changing their compiled runtime? Does not migrate/repair any input.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {engineLoader,compileMaterialized} from './hero-distillation-generation-compile.mts';
const script=fileURLToPath(import.meta.url),repoRoot=path.resolve(path.dirname(script),'../..');
const hash=(b:any)=>createHash('sha256').update(b).digest('hex');
const save=(p:string,v:any)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n',{flag:'wx'});
const runtimeFactories=new Map<string,any>();

export function differences(a:any,b:any,pointer=''):string[]{
  if(isDeepStrictEqual(a,b))return [];
  if(a===null||b===null||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return [pointer||'/'];
  const escape=(s:string)=>s.replaceAll('~','~0').replaceAll('/','~1');
  return [...new Set([...Object.keys(a),...Object.keys(b)])].sort().flatMap(k=>
    !Object.hasOwn(a,k)||!Object.hasOwn(b,k)?[pointer+'/'+escape(k)]:differences(a[k],b[k],pointer+'/'+escape(k)));
}

export async function inspectContract(repo:string,revision:string){
  assert(/^[a-f0-9]{40}$/.test(revision),'EXACT_REVISION_REQUIRED');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ggd-native-contract-'));
  const archive=execFileSync('git',['archive','--format=tar',revision,'package.json','packages/shared/package.json','packages/shared/src'],{cwd:repo,maxBuffer:64*1024*1024});
  execFileSync('tar',['-xf','-','-C',root],{input:archive});
  fs.symlinkSync(path.join(repoRoot,'packages/shared/node_modules'),path.join(root,'packages/shared/node_modules'),'dir');
  const source=path.join(root,'packages/shared/src/content/import/packageSchema.ts'),index=path.join(root,'packages/shared/src/content/import/contractIndex.ts');
  const schema=await import(pathToFileURL(source).href),registry=await import(pathToFileURL(index).href);
  const runtimeFile=path.join(root,'packages/shared/src/content/runtimeResolver.ts');
  runtimeFactories.set(revision,(await import(pathToFileURL(runtimeFile).href)).createRuntimeResolver);
  return {revision,archiveSha256:hash(archive),schemaSha256:hash(fs.readFileSync(source)),indexSha256:hash(fs.readFileSync(index)),
    runtimeResolverSha256:hash(fs.readFileSync(runtimeFile)),
    championAuthoringKindAccepted:schema.zAuthoringKind.safeParse('champion').success,
    heroAuthoringKindAccepted:schema.zAuthoringKind.safeParse('hero').success,
    rawRuntimeSchemas:schema.RAW_RUNTIME_SCHEMA_TAGS,
    championRepresentation:registry.REPRESENTATIONS.find((r:any)=>r.schema==='champion@1')??null,
    note:'Schema enum acceptance only; not full package validation, live import or gameplay.'};
}

export async function audit(repo:string,input:string,candidate:string,out:string){
  assert(!fs.existsSync(out),'REFUSE_OVERWRITE');
  assert(/^[a-f0-9]{40}$/.test(candidate),'EXACT_CANDIDATE_REQUIRED');
  const inputBytes=fs.readFileSync(path.join(input,'report.json')),report=JSON.parse(inputBytes.toString());
  assert.equal(report.schema,'ggd-distillation-generation-compile@1');
  const native:any[]=[];
  for(const [index,row]of report.rows.entries()){
    if(row.slot!=='HERO'||!row.schemaCompilePassed||!row.diskReloadCompileIdentical)continue;
    const dir=path.join(input,`case-${String(index).padStart(4,'0')}`),bytes=fs.readFileSync(path.join(dir,'authoring.json'));
    assert.equal(hash(bytes),row.authoringSha256,'AUTHORING_DRIFT');
    const output=JSON.parse(bytes.toString());if(output.format!=='native-content')continue;
    const compiled=fs.readFileSync(path.join(dir,'compiled.json'));assert.equal(hash(compiled),row.compiledSha256,'COMPILED_DRIFT');
    native.push({row,output,compiled:JSON.parse(compiled.toString())});
  }
  assert(native.length>0,'NO_NATIVE_OUTPUTS');
  const loader=engineLoader(repo),contracts:any={};
  for(const revision of new Set([...native.map(n=>n.row.engineRevision),candidate]))contracts[revision]=await inspectContract(repo,revision);
  const next=await loader.loadEngine(candidate),rows:any[]=[];
  for(const {row,output,compiled}of native){
    const before=JSON.stringify(output),record:any={id:row.id,sourceRevision:row.engineRevision,candidateRevision:candidate,
      candidateCompilePassed:false,runtimeIdentical:false,fullHeroE2EProven:false};rows.push(record);
    const sourceEngine=await loader.loadEngine(row.engineRevision),original=compileMaterialized(output,sourceEngine);
    assert.deepEqual(original,compiled,'SOURCE_RECOMPILE_DRIFT');
    try{
      const migrated=compileMaterialized(output,next),diff=differences(original,migrated);
      Object.assign(record,{candidateCompilePassed:true,runtimeIdentical:diff.length===0,differenceCount:diff.length,differencePaths:diff,
        sourceCompiledSha256:hash(JSON.stringify(original)),candidateCompiledSha256:hash(JSON.stringify(migrated))});
    }catch(error:any){record.error=String(error);}
    // Separate engine-code compatibility from changes to shared balance data.
    // Keep the frozen source catalog, but use the candidate runtime resolver.
    // This is an isolated diagnostic, not a write to either checkout/catalog.
    try{
      const fixedCatalog={...next,templates:sourceEngine.templates,configs:sourceEngine.configs,subtypes:sourceEngine.subtypes,
        templateMap:sourceEngine.templateMap,runtime:runtimeFactories.get(candidate)(sourceEngine.templateMap,sourceEngine.configs)};
      const fixed=compileMaterialized(output,fixedCatalog),diff=differences(original,fixed);
      record.candidateWithSourceCatalog={compilePassed:true,runtimeIdentical:diff.length===0,differenceCount:diff.length,
        differencePaths:diff,compiledSha256:hash(JSON.stringify(fixed)),
        policy:'Candidate schema/template expansion/runtime resolver with unchanged source templates/configs/subtypes.'};
    }catch(error:any){record.candidateWithSourceCatalog={compilePassed:false,runtimeIdentical:false,error:String(error)};}
    assert.equal(JSON.stringify(output),before,'INPUT_MUTATED');
  }
  fs.mkdirSync(out,{recursive:true});
  const result={schema:'ggd-distillation-native-compatibility@1',scriptSha256:hash(fs.readFileSync(script)),
    compileHelperSha256:hash(fs.readFileSync(new URL('./hero-distillation-generation-compile.mts',import.meta.url))),
    inputReportSha256:hash(inputBytes),sourceEvidence:report.sourceEvidence,candidateRevision:candidate,contracts,engines:loader.evidence,
    counts:{nativeWholeHeroes:rows.length,candidateCompilePassed:rows.filter(r=>r.candidateCompilePassed).length,
      runtimeIdentical:rows.filter(r=>r.runtimeIdentical).length,sourceCatalogRuntimeIdentical:rows.filter(r=>r.candidateWithSourceCatalog.runtimeIdentical).length},
    scope:'Read-only compatibility diagnostic, not migration approval. Exact current JSON recompiled on both revisions and separately with candidate code plus source catalog; schema package kind checked independently. No source repair, model inference, target-profile claims, package apply or game behavior evidence.',
    fullHeroE2EProven:false,modelPromoted:false,rows};save(path.join(out,'report.json'),result);return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===script){
  const args=process.argv.slice(2),o:any={};while(args.length){const k=args.shift()!;
    assert(['--source-repo','--compiled','--candidate','--out'].includes(k)&&args.length&&!o[k],'INVALID_ARGUMENT');o[k]=args.shift();}
  for(const k of ['--source-repo','--compiled','--candidate','--out'])assert(o[k],'MISSING:'+k);
  console.log(JSON.stringify((await audit(path.resolve(o['--source-repo']),path.resolve(o['--compiled']),o['--candidate'],path.resolve(o['--out']))).counts));
}
