// Bounded-action generated HeroPlan -> Main materialization/compiler bridge.
// It intentionally has no teacher-answer input and performs no repair.  The
// existing Main compiler remains authoritative for every candidate.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {engineLoader,compileMaterialized} from './hero-distillation-generation-compile.mts';
import {materializeTarget} from './hero-distillation-adapter.mjs';

const script=fileURLToPath(import.meta.url);
const hash=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const read=(file:string)=>JSON.parse(fs.readFileSync(file,'utf8'));
const save=(file:string,value:unknown)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const safe=(value:string)=>{assert(/^[A-Za-z0-9_.-]+$/.test(value),'UNSAFE_HERO_ID');return value;};

function actionEvaluation(root:string,arm:string){
  const manifest=read(path.join(root,'manifest.json'));
  assert.equal(manifest.schema,'ggd-action-protected-evaluation@1','ACTION_EVALUATION_SCHEMA');
  for(const name of ['modelDirectory','trainingDirectory'])assert(manifest[name],'UNBOUND_ACTION_EVALUATION:'+name);
  const publicBytes=fs.readFileSync(path.join(root,'public-heroes.json'));
  assert.equal(hash(publicBytes),manifest.publicHeroesSha256,'PUBLIC_INPUT_DRIFT');
  const publicData=JSON.parse(publicBytes.toString());
  assert.equal(publicData.schema,'ggd-action-public-evaluation@1','PUBLIC_INPUT_SCHEMA');
  const state=read(path.join(root,arm,'state.json'));
  assert.equal(state.status,'completed','ACTION_ARM_NOT_COMPLETED');assert.equal(state.workerPid,null,'ACTION_ARM_NOT_JOINED');
  const result=read(path.join(root,arm,'result.json'));
  assert.equal(result.attemptedHeroes,manifest.heroes,'ACTION_DENOMINATOR_DRIFT');
  const index=read(path.join(root,arm,'hero-index.json'));
  assert.equal(index.length,manifest.heroes,'ACTION_HERO_INDEX_DRIFT');
  assert.deepEqual(index.map((r:any)=>r.heroId),publicData.heroes.map((r:any)=>r.heroId),'ACTION_HERO_ORDER_DRIFT');
  return {manifest,publicData,index};
}

export async function run(options:Record<string,string>){
  const evaluation=path.resolve(options['--evaluation']),modelsDir=path.resolve(options['--models']),repo=path.resolve(options['--source-repo']),
    out=path.resolve(options['--out']),arm=options['--arm'];
  assert(!fs.existsSync(out),'REFUSE_OVERWRITE');assert(['base','lora'].includes(arm),'UNKNOWN_ARM');
  const input=actionEvaluation(evaluation,arm);
  const modelsManifest=read(path.join(modelsDir,'manifest.json')),modelsBytes=fs.readFileSync(path.join(modelsDir,'models.json'));
  assert.equal(modelsManifest.schema,'ggd-distillation-model-bindings@1','MODEL_BINDINGS_SCHEMA');
  assert.equal(hash(modelsBytes),modelsManifest.outputs['models.json'],'MODEL_BINDINGS_DRIFT');
  const models=JSON.parse(modelsBytes.toString()),loader=engineLoader(repo),rows:any[]=[];
  fs.mkdirSync(out,{recursive:true});
  for(const [index,hero] of input.publicData.heroes.entries()){
    const admission=input.index[index],row:any={id:hero.heroId,heroId:hero.heroId,slot:'HERO',engineRevision:hero.decisionSpace.revision,
      schemaCompilePassed:false,diskReloadCompileIdentical:false,fullHeroE2EProven:false,humanRepairs:0};
    rows.push(row);
    if(admission.status!=='complete') {row.status='blocked-by-action-generation';row.error=admission.error;continue;}
    try {
      const file=path.join(evaluation,arm,'heroes',safe(hero.heroId)+'.json'),generated=read(file);
      assert.equal(generated.status,'complete','ACTION_HERO_RESULT_NOT_COMPLETE');assert.equal(generated.heroId,hero.heroId,'ACTION_HERO_ID_DRIFT');
      assert(generated.target&&generated.target.format==='hero-plan','ACTION_HERO_TARGET_MISSING');
      const engine=await loader.loadEngine(row.engineRevision);
      const output=materializeTarget(generated.target,{heroId:hero.heroId,heroName:hero.heroName},engine,models);
      const folder=path.join(out,`case-${String(index).padStart(4,'0')}`);fs.mkdirSync(folder);
      save(path.join(folder,'authoring.json'),output);
      const reloaded=read(path.join(folder,'authoring.json'));assert.deepEqual(reloaded,output,'DISK_RELOAD_CHANGED');
      const first=compileMaterialized(reloaded,engine),again=compileMaterialized(read(path.join(folder,'authoring.json')),engine);
      assert.deepEqual(again,first,'RECOMPILE_CHANGED');save(path.join(folder,'compiled.json'),first);
      Object.assign(row,{status:'structural-pass-not-game-acceptance',schemaCompilePassed:true,diskReloadCompileIdentical:true,
        targetSha256:generated.targetSha256,authoringSha256:hash(fs.readFileSync(path.join(folder,'authoring.json'))),
        compiledSha256:hash(fs.readFileSync(path.join(folder,'compiled.json')))});
    } catch(error:any) {row.status='structural-failure';row.error=String(error);}
  }
  const report={schema:'ggd-distillation-generation-compile@1',sourceEvidence:{arm,actionEvaluationManifestSha256:hash(fs.readFileSync(path.join(evaluation,'manifest.json'))),
      publicInputSha256:input.manifest.publicHeroesSha256,teacherAnswerFileAccess:false},scriptSha256:hash(fs.readFileSync(script)),
    adapterSha256:hash(fs.readFileSync(new URL('./hero-distillation-adapter.mjs',import.meta.url))),modelBindingsSha256:hash(modelsBytes),engines:loader.evidence,
    counts:{allCases:rows.length,primaryWholeHeroes:rows.length,structuralPassed:rows.filter(r=>r.schemaCompilePassed&&r.diskReloadCompileIdentical).length,
      auxiliarySlots:0,auxiliaryStructuralPassed:0,auxiliaryBlockedByOwnWhole:0,auxiliarySlotsPending:0},
    scope:'Action-generated full HeroPlan materialization, schema, pinned compilation and disk reload/recompile. No teacher answers, repair, package admission, live import, selection, semantic-fidelity or match-behavior certification.',
    fullHeroE2EProven:false,modelPromoted:false,rows};
  save(path.join(out,'report.json'),report);return report;
}

if(process.argv[1]&&path.resolve(process.argv[1])===script){
  const args=process.argv.slice(2),options:Record<string,string>={};
  while(args.length){const key=args.shift()!;assert(['--evaluation','--models','--source-repo','--out','--arm'].includes(key)&&args.length,'UNKNOWN_OR_MISSING_ARGUMENT');assert(!options[key],'DUPLICATE_ARGUMENT');options[key]=args.shift()!;}
  for(const key of ['--evaluation','--models','--source-repo','--out','--arm'])assert(options[key],'MISSING:'+key);
  console.log(JSON.stringify((await run(options)).counts));
}
