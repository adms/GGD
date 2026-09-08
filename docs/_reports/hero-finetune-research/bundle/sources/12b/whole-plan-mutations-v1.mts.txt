/** Deliberately wrong runtime plans. No mutations to source or engine. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {wholePlan} from './whole-plan-seeds-v1.mts';
import {compileIR4,checkEnginePins,currentCatalog,hash} from './ir4-compiler.mts';
import {wholePlanProbes} from './whole-plan-probes-v2.mts';
import {zAbilityDoc} from '../../GGD-community-hero-forge/packages/shared/src/content/schema/ability.ts';
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.resolve(process.argv[2]);
assert.equal(path.dirname(out),here);assert(!fs.existsSync(out));checkEnginePins();
const catalog=currentCatalog(),bases=Object.fromEntries(['community7-lux','community7-xerath'].map(id=>{
  const f=wholePlan(id);return[id,compileIR4(f.ir,f.source,catalog).compiled];}));
function validateAuthorView(runtime:any){
  const view=structuredClone(runtime);
  // Resolved MS modifiers legitimately contain both tier and numeric value;
  // author schema forbids duplication. The runtime probe input is unchanged.
  const visit=(x:any)=>{if(!x||typeof x!=='object')return;
    if(x.msBonusTier!==undefined&&x.value!==undefined){assert(Number.isFinite(x.value));delete x.value;}
    for(const child of Object.values(x))visit(child);};
  visit(view);zAbilityDoc.parse(view);
}
const P='P-magic-ICD-without-mark-or-mana-restore',W='W-keep-larger-and-expire',E='field-stay',R='R-four-overlap-hits-frozen-direction';
const EX='EX-self-heal-and-three-second-speed-no-attack-buff';
const definitions:{id:string,hero:string,probe:string,mutate:(a:any)=>void,claim:string}[]=[];
function add(hero:string,id:string,probe:string,mutate:(a:any)=>void,claim='source-mechanic-negative'){
  definitions.push({id,hero:'community7-'+hero,probe,mutate,claim});
}
add('lux','passive-physical',P,a=>a.PASSIVE.passive.ranks[0].hooks[0].effects[0].damageType='physical');
add('lux','passive-no-ICD',P,a=>a.PASSIVE.passive.ranks[0].hooks[0].internalCooldown=0);
add('lux','passive-extra-hp-condition',P,a=>a.PASSIVE.passive.ranks[0].hooks[0].condition={kind:'stat',subject:'target',stat:'hp',mode:'percent',op:'<',value:0.1});
add('lux','passive-wrong-tier',P,a=>{a.PASSIVE.passive.ranks[0].hooks[0].effects[0].amount={damageTier:'小',flat:500};});
add('lux','Q-wrong-root-duration','Q-one-enemy-root-exact-duration-no-extra-hit',a=>a.Q.effects[0].duration=1.2);
add('lux','Q-extra-damage','Q-one-enemy-root-exact-duration-no-extra-hit',a=>a.Q.effects.push({kind:'damage',damageType:'magic',amount:{flat:10}}));
add('lux','W-physical-only','W-absorbs-magic',a=>a.W.effects[0].absorbs='physical');
add('lux','W-replace-greater',W,a=>a.W.effects[0].onExisting='replace');
add('lux','W-never-short-expires',W,a=>a.W.effects[0].duration=300);
add('lux','E-two-pulses',E,a=>a.E.effects[0].count=2);
add('lux','E-follows-frozen-target','field-leave',a=>a.E.effects[0].targetMode='frozen');
add('lux','E-divided-total-instead-of-per-pulse',E,a=>a.E.effects[0].effects[0].amount.flat/=3);
add('lux','R-one-hit-per-target',R,a=>a.R.effects[0].hitOncePerTarget=true);
add('lux','R-three-segments',R,a=>a.R.effects[0].count=3);
add('lux','EX-missing-heal',EX,a=>a.EX.effects=a.EX.effects.filter((e:any)=>e.kind!=='heal'));
add('lux','EX-AS-instead-of-MS',EX,a=>a.EX.effects[0].modifiers=[{stat:'as',op:'pctAdd',value:0.1}]);
add('lux','EX-wrong-speed-tier',EX,a=>a.EX.effects[0].modifiers[0]={stat:'ms',op:'pctAdd',value:0.5,msBonusTier:'小'});
add('xerath','Q-no-windup','Q-windup-four-scheduled-segments',a=>a.Q.castTimeSec=0);
add('xerath','Q-three-segments','Q-windup-four-scheduled-segments',a=>a.Q.effects[0].count=3);
// Q hitOncePerTarget is deliberately NOT a source-negative: the source is silent.
add('xerath','Q-unbounded-range','Q-finite-source-range',a=>a.Q.range=1000);
add('xerath','W-wrong-tier','W-single-ground-explosion-magic',a=>a.W.effects[0].amount={damageTier:'極小',flat:200});
add('xerath','E-long-stun','E-fixed-stun-distance-5',a=>a.E.effects[1].duration=1.8);
add('xerath','R-follows-frozen-target','field-leave',a=>a.R.effects[0].targetMode='frozen');
add('xerath','R-recast-during-barrage','R-cannot-reaim-during-barrage',a=>a.R.cooldown=[0,0,0]);
add('xerath','EX-wrong-mana-fraction','EX-adds-fifteen-percent-self-mana-and-keeps-cooldown',a=>a.EX.effects[1].manaPct=0.05);
add('xerath','EX-no-cooldown','EX-adds-fifteen-percent-self-mana-and-keeps-cooldown',a=>a.EX.cooldown=[0]);
add('xerath','EX-all-damage-shield','EX-shield-filter-physical',a=>a.EX.effects[0].absorbs='all');
const rows=definitions.map(d=>{
  const candidate=structuredClone(bases[d.hero]);d.mutate(candidate.abilityDrafts);
  // Avoid treating schema errors or bad test inputs as successful semantic catches.
  for(const a of Object.values(candidate.abilityDrafts))validateAuthorView(a);
  assert.notEqual(hash(JSON.stringify(candidate)),hash(JSON.stringify(bases[d.hero])),'INEFFECTIVE_MUTATION');
  const result=wholePlanProbes(candidate,d.hero,catalog,[d.probe]);assert.equal(result.total,2);
  return {id:d.id,hero:d.hero,probe:d.probe,claim:d.claim,mutationStage:'compiled-runtime-candidate',
    authorViewSchemaValid:true,runtimeResolvedMsValueStrippedInCheckOnlyCopy:true,sourceUnchanged:true,compilerNotReinvokedAfterMutation:true,
    caughtBothSeeds:result.rows.every((r:any)=>!r.passed),survivedBothSeeds:result.rows.every((r:any)=>r.passed),
    mutatedAbilityDrafts:candidate.abilityDrafts,result};
});
checkEnginePins();fs.mkdirSync(out);
const checkerFiles=['whole-plan-mutations-v1.mts','whole-plan-probes-v2.mts','whole-plan-seeds-v1.mts','ir-v4.mts','ir4-compiler.mts','probe-harness.mts'];
const manifest={schema:'ggd-whole-plan-mutation-audit@1',createdAt:new Date().toISOString(),
  sourcePositiveRun:'whole-plan-candidates-v2',mutants:rows.length,caughtBothSeeds:rows.filter(r=>r.caughtBothSeeds).length,
  survived:rows.filter(r=>!r.caughtBothSeeds).map(r=>r.id),
  checkerPins:Object.fromEntries(checkerFiles.map(f=>[f,hash(fs.readFileSync(path.join(here,f)))])),
  caveats:['Deliberate runtime mutations test checker sensitivity, not model accuracy.','Frozen template bindings are not rebuilt for fault injection. Check-only author views omit compiler-resolved MS values; runtime candidates are unchanged.','Xerath Q repeat policy is unscored as a source-negative.'],
  modelInference:false,modelTraining:false,trainingAdmitted:0,fullHeroQualified:0};
for(const [name,value] of Object.entries({'manifest.json':manifest,'cases.json':rows}))fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(manifest,null,2));process.exitCode=manifest.survived.length?1:0;
