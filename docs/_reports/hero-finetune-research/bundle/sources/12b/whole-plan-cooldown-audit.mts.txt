/** Distinguish immediate engine floor from sustained EX cooldown. CPU only. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {wholePlan} from './whole-plan-seeds-v1.mts';
import {compileIR4,checkEnginePins,currentCatalog,hash} from './ir4-compiler.mts';
import {engineProbe} from './probe-harness.mts';
import {castAbility} from '../../GGD-community-hero-forge/packages/shared/src/sim/abilities/abilitySystem.ts';
import {abilityInstanceFor} from '../../GGD-community-hero-forge/packages/shared/src/sim/abilities/innateActive.ts';
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.resolve(process.argv[2]);
assert.equal(path.dirname(out),here);assert(!fs.existsSync(out));checkEnginePins();
const f=wholePlan('community7-xerath'),catalog=currentCatalog(),base=compileIR4(f.ir,f.source,catalog).compiled,rows:any[]=[];
for(const seed of [20260908,20260909])for(const variant of ['candidate','zero-authored-cooldown']){
  const compiled=structuredClone(base);if(variant!=='candidate')compiled.abilityDrafts.EX.cooldown=[0];
  const result=engineProbe(compiled,catalog,variant,r=>{
    for(const id of [r.caster,r.foe,r.other])r.world.status.get(id).effects.push({statusId:'audit-disarm',sourceId:'fixture-only',applierId:id,expiresAtTick:10000,stacks:1,disarmed:true});
    assert.equal(r.cast('EX'),'ok');const ticks=abilityInstanceFor(r.world.abilities.get(r.caster),'EX')!.cooldownRemainingTicks;
    const immediate=castAbility(r.world,r.caster,'EX',{type:'self'});assert.equal(immediate,'cooldown');
    r.step(4);const later=castAbility(r.world,r.caster,'EX',{type:'self'});
    assert.equal(later,variant==='candidate'?'cooldown':'ok');
    return {authoredSeconds:compiled.abilityDrafts.EX.cooldown[0],initialCooldownTicks:ticks,dt:r.world.dt,
      minimumSeconds:r.world.cooldownRules.minSeconds,immediate,afterFourTicks:later};
  },seed);rows.push({variant,...result});
}
checkEnginePins();const result={schema:'ggd-ex-cooldown-sensitivity-audit@1',createdAt:new Date().toISOString(),
  total:rows.length,passed:rows.filter(r=>r.passed).length,rows,
  finding:'Immediate rejection alone cannot prove EX sustained cooldown. Zero authored cooldown still gets native 0.1s floor; after 4 ticks it can recast.',
  sourceNumericCooldownSpecified:false,baselineSixtySecondsIsInheritedPolicy:true,
  nextAction:'Add a separately labeled inherited-policy check and delayed cooldown boundary checks; do not teach 60 as a number stated by source.',
  checkerPins:Object.fromEntries(['whole-plan-cooldown-audit.mts','probe-harness.mts','ir4-compiler.mts','whole-plan-seeds-v1.mts'].map(n=>[n,hash(fs.readFileSync(path.join(here,n)))])),
  modelInference:false,modelTraining:false,fullHeroQualified:0};
fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({total:result.total,passed:result.passed,rows:rows.map(r=>({variant:r.variant,seed:r.seed,evidence:r.evidence,error:r.error}))},null,2));
process.exitCode=result.passed===result.total?0:1;
