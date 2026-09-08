/** CPU evidence collection only. No GPU, model generation or admission bypass. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {WHOLE_PLANS5} from './whole-plan-seeds-v2.mts';
import {CONTRAST_HEROES,contrastHero} from './contrast-heroes-v1.mts';
import {contrastProbes} from './contrast-probes-v1.mts';
import {wholePlanProbes5} from './whole-plan-probes-ir5.mts';
import {wholePlanPolicyProbes} from './whole-plan-policy-probes.mts';
import {compileIR5} from './ir-v5.mts';
import {ir5JSONSchema} from './ir5-json-schema.mts';
import {checkEnginePins,currentCatalog,hash} from './ir-compiler.mts';
import {maskValues} from './semantic-loss-mask.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.resolve(process.argv[2]);
assert.equal(path.dirname(out),here);assert(!fs.existsSync(out));checkEnginePins();const catalog=currentCatalog(),schema=ir5JSONSchema();
const policy='只依完整GGD原文生成六槽機制IR5。嚴格遵守JSON Schema，只輸出單一JSON，不輸出推理或Markdown。保留英雄設定、否定、對象、時序、次數與跨槽關係，不自行補取消的機制。evidence須為連續原文。castTiming.requirement分開表示原文要求吟唱、明示不用吟唱、未交代；未知秒數填null，不能把不知道秒數當成不需要吟唱。其他來源未知且允許null的欄位填null，由script負責預覽值。原文明示數值則保留。不得把未知微調參數當成缺少機制；真正無法表示或支援的機制記入mechanismGaps。引用正確不等於語意已驗證。特效、包裝、冷卻等script政策不在此生成。';
const compact=(p:any)=>({...p,rows:p.rows.map(({frames,...r}:any)=>({...r,frameCount:frames.length,
  framesSha256:hash(JSON.stringify(frames)),...(!r.passed?{frames}:{} )}))});
const rows:any[]=[],dataset:any[]=[];
for(const f of [...WHOLE_PLANS5,...CONTRAST_HEROES] as any[]){
  const before=hash(JSON.stringify(f)),built=compileIR5(f.ir,f.source,catalog),synthetic=f.synthetic===true;
  const behavior=synthetic?contrastProbes(built.compiled,f,catalog):wholePlanProbes5(built.compiled,f.id,catalog);
  const policyChecks=wholePlanPolicyProbes(built.compiled,catalog);assert.equal(hash(JSON.stringify(f)),before,'INPUT_MUTATED');
  rows.push({id:f.id,source:f.source,ir:f.ir,synthetic,sourceFamily:f.sourceFamily??'historical-league-of-legends-ggd',
    sourceSha256:f.source.hero.sourceSha256,behavior:compact(behavior),policy:compact(policyChecks),
    compiled:built.compiled,project:built.project,previewProposals:built.previewProposals,unresolvedSourceChoices:built.unresolvedSourceChoices,
    fullHeroQualified:false,trainingAdmitted:false,sourceSemanticsAutomaticallyVerified:false});
  const excluded:any[]=[];
  for(const [s,slot] of Object.entries(f.ir.slots) as any[]){
    excluded.push({pointer:`/slots/${s}/tuningNotes`,reason:'ungraded-editor-notes'});
    if(slot.castTiming.evidence!==null)excluded.push({pointer:`/slots/${s}/castTiming/evidence`,reason:'source-copy-scaffolding-not-semantic-selector'});
    slot.actions.forEach((a:any,i:number)=>excluded.push({pointer:`/slots/${s}/actions/${i}/evidence`,reason:'source-copy-scaffolding-not-mechanic-classification'}));
  }
  const target=maskValues(f.ir,excluded),messages=[{role:'system',content:policy+'\nJSON Schema:\n'+JSON.stringify(schema)},
    {role:'user',content:JSON.stringify({source:f.source.hero,slots:f.source.slots,sources:f.source.sources})}];
  assert(!target.excluded.some((s:any)=>s.pointer.endsWith('/requirement')||s.pointer.endsWith('/seconds')),'SEMANTIC_TIMING_MASKED');
  dataset.push({id:'ir5-control-'+f.id,heroId:f.id,sourceSha256:f.source.hero.sourceSha256,
    sourceFamily:f.sourceFamily??'historical-league-of-legends-ggd',split:f.split??'engineering-real-source-control',
    synthetic,independentSourceHero:false,freshBlind:false,messages,requestDigest:hash(JSON.stringify(messages)),target,
    fullHeroRecipeTrainingAdmitted:false,trainingMayStart:false,automaticAccept:false,
    castRequirementAndNullSecondsSupervised:true,arbitraryPreviewValuesInTarget:false,
    caveat:'Engineering preparation only. Synthetic permutations share a source family and wording; real controls are historically exposed. Direct masking does not remove teacher-forcing context.'});
  console.log(JSON.stringify({id:f.id,behavior:`${behavior.passed}/${behavior.total}`,policy:`${policyChecks.passed}/${policyChecks.total}`}));
}
const mutations=[
  ['remove-required-windup','SOURCE_CAST_PHASE',(f:any)=>f.ir.slots.Q.castTiming={requirement:'not_specified',seconds:null,evidence:null}],
  ['unit-to-ground','SOURCE_TARGET_CONTRACT',(f:any)=>f.ir.slots.Q.delivery='ground'],
  ['field-count-one','PRIMARY_SPATIAL_HITS',(f:any)=>f.ir.slots.W.actions[0].count=1],
  ['line-repeat-removed','PRIMARY_SPATIAL_HITS',(f:any)=>f.ir.slots.E.actions[0].repeatHits='once_per_cast'],
  ['field-follows-caster','PRIMARY_SPATIAL_HITS',(f:any)=>{f.ir.slots.W.delivery='self';f.ir.slots.W.actions[0].anchor='caster';}],
  ['wrong-damage-type','SOURCE_DAMAGE_TYPE',(f:any)=>f.ir.slots.Q.actions[0].damageType='physical'],
  ['wrong-damage-tier','SOURCE_TIER',(f:any)=>f.ir.slots.Q.actions[0].tier='極小'],
  ['wrong-mana-fraction','MAX_MANA_ADDITIVE',(f:any)=>f.ir.slots.EX.actions[0].fraction=0.05],
  ['wrong-shield-type','SHIELD_LEAK',(f:any)=>f.ir.slots.R.actions[0].absorbs='magic'],
  ['negated-cast-quote','SOURCE_CAST_PHASE',(f:any)=>f.ir.slots.Q.castTiming.requirement='required'],
] as const;
const negative=mutations.map(([id,diagnostic,mutate])=>{
  const f=contrastHero(0,id==='negated-cast-quote'?'none':'required');mutate(f);
  const b=compileIR5(f.ir,f.source,catalog),p=contrastProbes(b.compiled,f,catalog,[20260908]);
  return {id,diagnostic,sourceSha256:f.source.hero.sourceSha256,mutatedIR:f.ir,compiledSha256:hash(JSON.stringify(b.compiled)),
    stage:'IR-semantic-mutation-before-unmodified-compiler',IRAndCompilePassed:true,
    rejected:p.rows.some(r=>!r.passed&&r.error.includes(diagnostic)),behavior:compact(p)};
});
const total=(key:string)=>({passed:rows.reduce((n,r)=>n+r[key].passed,0),total:rows.reduce((n,r)=>n+r[key].total,0)});
const pins=['collect-ir5-data-stage.mts','ir-v5.mts','ir5-json-schema.mts','whole-plan-seeds-v2.mts','contrast-heroes-v1.mts','contrast-probes-v1.mts',
  'whole-plan-probes-ir5.mts','whole-plan-probes-v3.mts','whole-plan-policy-probes.mts','semantic-loss-mask.mjs','ir-v4.mts','ir4-compiler.mts',
  'native-mechanism-actions.mts','probe-harness.mts','whole-plan-acceptance-v1/cases.json'];
const manifest={schema:'ggd-ir5-data-engineering-stage@1',createdAt:new Date().toISOString(),heroes:rows.length,
  realExposedControls:2,syntheticControls:12,syntheticFamilies:1,slots:84,independentBlindHeroes:0,
  behavior:total('behavior'),policy:total('policy'),negative:{caught:negative.filter(r=>r.rejected).length,total:negative.length},
  responseSchemaSha256:hash(JSON.stringify(schema)),datasetSha256:hash(JSON.stringify(dataset)),casesSha256:hash(JSON.stringify(rows)),negativeSha256:hash(JSON.stringify(negative)),
  checkerPins:Object.fromEntries(pins.map(f=>[f,hash(fs.readFileSync(path.join(here,f)))])),
  engineSourcePinsSha256:hash(fs.readFileSync(path.join(here,'current-engine-v1/source-pins.json'))),
  modelInference:false,modelTraining:false,gpuStarted:false,trainingAdmitted:0,fullHeroQualified:0,
  scope:'12 permutations are one procedural family, not 12 independent source heroes. Two real heroes are exposed engineering controls. Runtime checks are bounded fixtures, not exhaustive content certification.'};
checkEnginePins();fs.mkdirSync(out);
for(const [name,v] of Object.entries({'manifest.json':manifest,'cases.private.json':rows,'negative.private.json':negative,
  'dataset.private.json':dataset,'response-schema.json':schema}))fs.writeFileSync(path.join(out,name),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(manifest,null,2));
process.exitCode=manifest.behavior.passed===manifest.behavior.total&&manifest.policy.passed===manifest.policy.total&&manifest.negative.caught===manifest.negative.total?0:1;
