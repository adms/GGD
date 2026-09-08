/** Research action extension; not yet part of frozen IR3 or any model run. */
import assert from 'node:assert/strict';
import {z} from '../../GGD-community-hero-forge/packages/shared/node_modules/zod/index.js';
import {TIERS} from './semantic-ir.mts';
import {DELAYED_MAX_COUNT,DELAYED_MAX_STEP_DIST} from '../../GGD-community-hero-forge/packages/shared/src/sim/effects/kindLimits.ts';
import {DISPLACEMENT_AUTHORED_SPEED_MAX,DISPLACEMENT_SPEED_MIN,DISPLACEMENT_TRAVEL_DISTANCE_MAX} from '../../GGD-community-hero-forge/packages/shared/src/content/displacementTiers.ts';

const n=(min:number,max:number)=>z.number().finite().min(min).max(max);
const maybe=(schema:any)=>schema.nullable().optional();
const o=(shape:any)=>z.object(shape).strict();
export const NATIVE_ACTIONS={
  move_only:o({op:z.literal('move_only'),direction:z.enum(['aim','facing']),
    // These are mandatory limitations, not a claim of arrival at the aimed point.
    travelRule:z.literal('fixed_distance'),collisionRule:z.literal('engine_default'),
    distance:maybe(n(0.1,DISPLACEMENT_TRAVEL_DISTANCE_MAX)),
    speed:maybe(n(DISPLACEMENT_SPEED_MIN,DISPLACEMENT_AUTHORED_SPEED_MAX))}),
  restore_mana:o({op:z.literal('restore_mana'),target:z.literal('self'),
    basis:z.literal('maximum_mana'),mode:z.literal('add'),fraction:n(0.001,1)}),
  line_sequence:o({op:z.literal('line_sequence'),count:n(1,DELAYED_MAX_COUNT).int(),
    direction:z.literal('cast_facing'),repeatHits:z.enum(['per_segment','once_per_cast']),
    interval:maybe(n(1/30,10)),firstDelay:maybe(n(1/30,10)),
    stepDistance:maybe(n(0.1,DELAYED_MAX_STEP_DIST)),radius:maybe(n(0.1,10)),
    damageType:maybe(z.enum(['physical','magic','true'])),tier:maybe(z.enum(TIERS as [string,...string[]]))}),
};
export const zNativeAction=z.discriminatedUnion('op',Object.values(NATIVE_ACTIONS) as any);
export function lowerNativeAction(input:unknown,delivery:string,location='action'){
  const a:any=zNativeAction.parse(input),proposals:any[]=[];
  const proposed=(field:string,value:any)=>{
    if(a[field]!==undefined&&a[field]!==null)return a[field];
    proposals.push({location,field,value,basis:'research-preview-policy-not-source',requiresTuning:true});return value;
  };
  let effects:any[];const limitations:string[]=[];
  switch(a.op){
    case 'move_only':
      assert.equal(delivery,a.direction==='aim'?'ground':'self','MOVE_DELIVERY');
      effects=[{kind:'dash',mode:a.direction==='aim'?'toPoint':'forward',speed:proposed('speed',6),maxDistance:proposed('distance',2)}];
      limitations.push('Aimed point selects launch direction, not exact arrival distance.',
        'Normal body separation can move other units; no authored hit, knockback or onEnd payload.',
        'This does not promise stop-on-unit contact, wall phasing, invulnerability, or aim-state cancellation.');
      break;
    case 'restore_mana':
      assert.equal(delivery,'self','MANA_DELIVERY');
      effects=[{kind:'restore',applyTo:'self',manaPct:a.fraction}];
      limitations.push('Adds a fraction of maximum mana after cast cost; overflow clamps at maximum.',
        'Does not set mana to that percentage and does not replace ability cooldown or cost.');
      break;
    case 'line_sequence':
      assert(['ground','self','skillshot'].includes(delivery),'LINE_DELIVERY');
      effects=[{kind:'delayed',shape:'circle',radius:proposed('radius',2.75),side:'enemies',
        delaySec:proposed('firstDelay',0.1),count:a.count,intervalSec:proposed('interval',0.1),
        targetMode:'reresolve',hitOncePerTarget:a.repeatHits==='once_per_cast',
        advance:{stepDist:proposed('stepDistance',0.5),dir:'facing'},
        effects:[{kind:'damage',damageType:proposed('damageType','magic'),amount:{damageTier:proposed('tier','極小')}}]}];
      limitations.push('Uses native segmented circular hit regions along the frozen launch direction, not a visual beam.',
        'repeatHits is mandatory and must be source-justified; template defaults are not source evidence.',
        'No terminal explosion, homing, or mid-cast re-aim is added.');
      break;
    default:throw new Error('UNREACHABLE_NATIVE_ACTION');
  }
  return {action:a,effects,proposals,limitations,sourceEntailmentVerified:false,automaticAccept:false};
}
