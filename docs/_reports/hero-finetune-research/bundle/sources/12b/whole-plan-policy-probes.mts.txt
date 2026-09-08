/** Inherited assembly policy is NOT source entailment or a model-generated tuning label. */
import assert from 'node:assert/strict';
import {engineProbe} from './probe-harness.mts';
import {zHeroSlotPlans} from '../../GGD-community-hero-forge/packages/shared/src/content/heroForge/plan.ts';
import {castAbility} from '../../GGD-community-hero-forge/packages/shared/src/sim/abilities/abilitySystem.ts';
import {abilityInstanceFor} from '../../GGD-community-hero-forge/packages/shared/src/sim/abilities/innateActive.ts';
export function wholePlanPolicyProbes(compiled:any,catalog:any){
  const inherited=zHeroSlotPlans.shape.EX.shape.tuning.parse(undefined);
  const rows=[20260908,20260909].map(seed=>engineProbe(compiled,catalog,'inherited-EX-cooldown-boundaries',r=>{
    for(const id of [r.caster,r.foe,r.other])r.world.status.get(id).effects.push({statusId:'research-policy-disarm',sourceId:'fixture',applierId:id,expiresAtTick:10000,stacks:1,disarmed:true});
    // This compiler intentionally owns unspecified cooldowns; model IR has no CD field.
    assert.deepEqual(compiled.abilityDrafts.EX.cooldown,[inherited.cooldownSec],'INHERITED_EX_COOLDOWN_POLICY');
    assert.equal(r.cast('EX'),'ok');
    const ticks=abilityInstanceFor(r.world.abilities.get(r.caster),'EX')!.cooldownRemainingTicks;
    assert(Number.isInteger(ticks)&&ticks>4&&ticks<=10000,'BOUNDED_EX_COOLDOWN');
    assert.equal(castAbility(r.world,r.caster,'EX',{type:'self'}),'cooldown');r.step(4);
    assert.equal(castAbility(r.world,r.caster,'EX',{type:'self'}),'cooldown','EX_RECAST_AFTER_FLOOR');
    r.step(ticks-5);assert.equal(castAbility(r.world,r.caster,'EX',{type:'self'}),'cooldown','EX_RECAST_ONE_TICK_EARLY');
    r.step(1);assert.equal(castAbility(r.world,r.caster,'EX',{type:'self'}),'ok','EX_STUCK_AFTER_EXPIRY');
    return {inheritedSeconds:inherited.cooldownSec,initialTicks:ticks,immediate:'cooldown',afterFourTicks:'cooldown',
      oneTickBeforeExpiry:'cooldown',atExpiry:'ok',numberIsSourceClaim:false};
  },seed));
  return {scope:'inherited-assembly-policy-only',total:rows.length,passed:rows.filter(r=>r.passed).length,rows,
    numericSourceEntailmentClaim:false,modelTuningTraining:false};
}
