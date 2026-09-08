import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv2020 from '../../GGD-community-hero-forge/node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/2020.js';
import {shortJSONSchema} from './ir3-json-schema.mts';
import {zIR3,compactIR2} from './ir-v3.mts';
import {fixtures} from './ir-fixtures.mts';
const ajv=new Ajv2020({strict:true,allErrors:true,coerceTypes:false,useDefaults:false,removeAdditional:false});
const schema=shortJSONSchema(),valid=ajv.compile(schema);
const both=(value:any,expected:boolean)=>{const original=JSON.stringify(value);
  assert.equal(valid(value),expected,JSON.stringify(valid.errors));assert.equal(zIR3.safeParse(value).success,expected);
  assert.equal(JSON.stringify(value),original);};
for(const f of fixtures)test(`IR3 JSON Schema / Zod agree: ${f.id}`,()=>both(compactIR2(f.ir,f.source),true));
for(const [name,mutate] of [
  ['missing schema',(v:any)=>delete v.schema],
  ['origin as array',(v:any)=>v.hero.origin=['狂戰']],
  ['nullable wrapper',(v:any)=>v.slots.Q.rangeTier={optional:null}],
  ['action keyed wrapper',(v:any)=>v.slots.Q.actions=[{dot:v.slots.Q.actions[0]}]],
  ['missing required value',(v:any)=>delete v.slots.PASSIVE.actions[0].cooldown],
  ['wrong numeric type',(v:any)=>v.slots.PASSIVE.actions[0].cooldown='2'],
  ['unknown field',(v:any)=>v.slots.Q.actions[0].evidence='not model-owned'],
  ['unknown slot',(v:any)=>v.slots.EXTRA=v.slots.Q]
] as [string,(v:any)=>void][])test(name,()=>{const v=compactIR2(fixtures[0].ir,fixtures[0].source);mutate(v);both(v,false);});
test('nullable fields may be absent, required fields remain required',()=>{
  const s=schema.$defs.action_attack_proc;
  assert(!s.required.includes('targetHpBelow'));assert(s.required.includes('cooldown'));
  assert.equal(schema.properties.hero.properties.origin.type,'string');
  assert.equal(schema.$defs.action.oneOf.length,19);
});
