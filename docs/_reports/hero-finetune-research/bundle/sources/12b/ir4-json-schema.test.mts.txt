import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv2020 from '../../GGD-community-hero-forge/node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/2020.js';
import {ir4JSONSchema} from './ir4-json-schema.mts';
import {zIR4} from './ir-v4.mts';
import {fixtures} from './ir-fixtures.mts';
import {wholePlan} from './whole-plan-seeds-v1.mts';
const schema=ir4JSONSchema(),valid=new Ajv2020({strict:true,allErrors:true,coerceTypes:false,useDefaults:false,removeAdditional:false}).compile(schema);
const both=(v:any,expected:boolean)=>{const before=JSON.stringify(v);assert.equal(valid(v),expected,JSON.stringify(valid.errors));
  assert.equal(zIR4.safeParse(v).success,expected);assert.equal(JSON.stringify(v),before);};
for(const f of fixtures)test(`legacy structure unchanged: ${f.id}`,()=>{
  const ir=structuredClone(f.ir);ir.schema='hero-semantic-ir@4';for(const s of Object.values(ir.slots) as any[]){delete s.sourceEvidence;delete s.vfxRecommendation;}both(ir,true);
});
for(const id of ['community7-lux','community7-xerath'])test(`new six slot native structure: ${id}`,()=>both(wholePlan(id).ir,true));
for(const [label,fn] of [
  ['required repeat policy',(a:any)=>delete a.slots.R.actions[0].repeatHits],
  ['string count',(a:any)=>a.slots.R.actions[0].count='4'],
  ['fractional count',(a:any)=>a.slots.R.actions[0].count=3.5],
  ['zero interval',(a:any)=>a.slots.R.actions[0].interval=0],
  ['unknown extension',(a:any)=>a.slots.R.actions[0].extra=true],
  ['missing legacy duration',(a:any)=>delete a.slots.Q.actions[0].duration],
  ['native nested in legacy projectile',(a:any)=>a.slots.Q.actions=[{op:'projectile',evidence:'example',onHit:[a.slots.R.actions[0]]}]],
] as const)test(`reject ${label}`,()=>{const a=wholePlan('community7-lux').ir;fn(a);both(a,false);});
test('native optional tuning can be absent, but not required mechanics',()=>{
  const a=wholePlan('community7-lux').ir;for(const k of ['interval','firstDelay','stepDistance','radius','damageType','tier'])delete a.slots.R.actions[0][k];both(a,true);
});
test('legacy nested action remains valid',()=>{
  const a=wholePlan('community7-lux').ir;a.slots.Q.actions=[{op:'projectile',evidence:'example',onHit:[{op:'damage',damageType:null,tier:null,evidence:'example'}]}];both(a,true);
});
test('22 top-level actions versus 19 nested actions',()=>{
  assert.equal(schema.$defs.action.oneOf.length,22);assert.equal(schema.$defs.legacy_action.oneOf.length,19);
  assert.equal(Object.keys(schema.properties.slots.properties).length,6);
});
