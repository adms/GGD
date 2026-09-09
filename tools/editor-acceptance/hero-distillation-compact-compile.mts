// Compact-evaluation target -> pinned engine materializer -> compiler -> disk
// reload/recompile.  This is structural evidence only; it never treats a
// compile pass as gameplay, import or semantic-fidelity approval.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {engineLoader,compileMaterialized} from './hero-distillation-generation-compile.mts';
import {materializeTarget} from './hero-distillation-adapter.mjs';

const script=fileURLToPath(import.meta.url),hash=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const read=(file:string)=>JSON.parse(fs.readFileSync(file,'utf8'));
const save=(file:string,value:unknown)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const safe=(id:string)=>{assert(/^[A-Za-z0-9._-]+$/.test(id),'UNSAFE_HERO_ID');return id;};

export async function run(options:Record<string,string>){
  const evaluation=path.resolve(options['--evaluation']),arm=options['--arm'],modelsDirectory=path.resolve(options['--models']),repo=path.resolve(options['--source-repo']),out=path.resolve(options['--out']);
  assert(['base','lora'].includes(arm),'UNKNOWN_ARM');assert(!fs.existsSync(out),'REFUSE_OVERWRITE');
  const manifest=read(path.join(evaluation,'manifest.json')),state=read(path.join(evaluation,arm,'state.json')),
    result=read(path.join(evaluation,arm,'result.json')),publicBundle=read(path.join(evaluation,'public-heroes.json')),
    modelsBytes=fs.readFileSync(path.join(modelsDirectory,'models.json')),models=JSON.parse(modelsBytes.toString());
  assert.equal(manifest.schema,'ggd-compact-protected-evaluation@1');
  assert.equal(state.status,'completed','INFERENCE_NOT_TERMINAL_SUCCESS');assert.equal(state.workerPid,null,'INFERENCE_WORKER_STILL_LIVE');
  assert.equal(state.manifestSha256,hash(fs.readFileSync(path.join(evaluation,'manifest.json'))),'INFERENCE_MANIFEST_DRIFT');
  assert.equal(result.attemptedHeroes,manifest.heroes,'INCOMPLETE_GENERATION');assert.equal(result.humanRepairs,0,'HUMAN_REPAIR_NOT_ALLOWED');
  assert.equal(hash(fs.readFileSync(path.join(evaluation,'public-heroes.json'))),manifest.publicHeroesSha256,'PUBLIC_INPUT_DRIFT');
  assert.equal(publicBundle.teacherAccess,'No teacher answer is included in this public bundle.','TEACHER_BOUNDARY_DRIFT');
  assert(!JSON.stringify(publicBundle).includes('"role":"assistant"'),'TEACHER_LEAKED_TO_COMPILE');
  const dataset=path.resolve(manifest.datasetDirectory),datasetManifest=read(path.join(dataset,'manifest.json'));
  assert.equal(hash(fs.readFileSync(path.join(dataset,'manifest.json'))),manifest.datasetManifestSha256,'DATASET_DRIFT');
  const examples=read(path.join(dataset,'examples.json')),revisionByHero=new Map<string,string>();
  for(const row of examples)if(row.slot==='HERO')revisionByHero.set(row.heroId,row.engineRevision);
  assert.equal(revisionByHero.size,74,'ENGINE_REVISION_SOURCE_DRIFT');
  assert.equal(datasetManifest.schema,'ggd-distillation-compact-frozen-data@1');
  const loader=engineLoader(repo),rows:any[]=[];fs.mkdirSync(out,{recursive:true});
  for(const hero of publicBundle.heroes){
    const heroId=safe(hero.heroId),source=path.join(evaluation,arm,'heroes',heroId+'.json'),bytes=fs.readFileSync(source),generated=JSON.parse(bytes.toString());
    const row:any={heroId,engineRevision:revisionByHero.get(heroId),status:'structural-failure',humanRepairs:0,schemaCompilePassed:false,diskReloadCompileIdentical:false,fullHeroE2EProven:false,generationSha256:hash(bytes)};rows.push(row);
    try{
      assert.equal(generated.heroId,heroId,'GENERATED_HERO_ID_DRIFT');assert.equal(generated.humanRepairs,0,'HUMAN_REPAIR_NOT_ALLOWED');
      assert.equal(generated.target?.format,'hero-plan','ASSEMBLY_OUTPUT_FORMAT');assert.equal(generated.target.plan.title,hero.heroName,'TARGET_HERO_NAME_DRIFT');
      const engine=await loader.loadEngine(row.engineRevision),output=materializeTarget(generated.target,{heroId,heroName:hero.heroName},engine,models),compiled=compileMaterialized(output,engine);
      const folder=path.join(out,heroId);fs.mkdirSync(folder);save(path.join(folder,'authoring.json'),output);
      const reloaded=read(path.join(folder,'authoring.json'));assert.deepEqual(reloaded,output,'DISK_RELOAD_CHANGED');
      const recompiled=compileMaterialized(reloaded,engine);assert.deepEqual(recompiled,compiled,'RECOMPILE_CHANGED');
      save(path.join(folder,'compiled.json'),compiled);
      Object.assign(row,{status:'structural-pass-not-game-acceptance',schemaCompilePassed:true,diskReloadCompileIdentical:true,
        authoringSha256:hash(fs.readFileSync(path.join(folder,'authoring.json'))),compiledSha256:hash(fs.readFileSync(path.join(folder,'compiled.json')))});
    }catch(error:any){row.error=String(error);}
  }
  const report={schema:'ggd-compact-generation-compile@1',arm,evaluationManifestSha256:hash(fs.readFileSync(path.join(evaluation,'manifest.json'))),
    publicHeroesSha256:manifest.publicHeroesSha256,modelBindingsSha256:hash(modelsBytes),scriptSha256:hash(fs.readFileSync(script)),
    adapterMaterializerSha256:hash(fs.readFileSync(new URL('./hero-distillation-adapter.mjs',import.meta.url))),engines:loader.evidence,
    counts:{heroes:rows.length,structuralPassed:rows.filter(row=>row.schemaCompilePassed&&row.diskReloadCompileIdentical).length},
    scope:'Per-arm own compact decisions were assembled by script, materialized against the pinned engine, schema-checked, compiled, written to disk, reloaded and recompiled. No teacher answer was read by the evaluator. This excludes semantic fidelity, asset-byte closure, package admission, Editor import, selection into a match and gameplay behavior.',
    fullHeroE2EProven:false,modelPromoted:false,rows};save(path.join(out,'report.json'),report);return report;
}

if(process.argv[1]&&path.resolve(process.argv[1])===script){
  const args=process.argv.slice(2),options:Record<string,string>={};while(args.length){const key=args.shift()!;assert(['--evaluation','--arm','--models','--source-repo','--out'].includes(key)&&args.length,'UNKNOWN_OR_MISSING_ARGUMENT');assert(!Object.hasOwn(options,key),'DUPLICATE_ARGUMENT');options[key]=args.shift()!;}
  for(const key of ['--evaluation','--arm','--models','--source-repo','--out'])assert(options[key],'MISSING:'+key);console.log(JSON.stringify((await run(options)).counts));
}
