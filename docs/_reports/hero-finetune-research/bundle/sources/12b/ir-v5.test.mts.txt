import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv2020 from '../../GGD-community-hero-forge/node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/2020.js';
import {fixtures} from './ir-fixtures.mts';
import {compileIR,currentCatalog,checkEnginePins,hash} from './ir-compiler.mts';
import {compileIR4} from './ir4-compiler.mts';
import {compileIR5,resolveIR5,zIR5,IR5_PREVIEW} from './ir-v5.mts';
import {ir5JSONSchema} from './ir5-json-schema.mts';
import {wholePlan5} from './whole-plan-seeds-v2.mts';
import {wholePlan} from './whole-plan-seeds-v1.mts';
import {engineProbe} from './probe-harness.mts';
const catalog=currentCatalog();checkEnginePins();
const schema=ir5JSONSchema(),valid=new Ajv2020({strict:true,allErrors:true,coerceTypes:false,useDefaults:false,removeAdditional:false}).compile(schema);
function both(v:any,expected:boolean){assert.equal(valid(v),expected,JSON.stringify(valid.errors));assert.equal(zIR5.safeParse(v).success,expected);}
for(const f of fixtures)test(`explicit compatibility fixture preserves old compiled artifact: ${f.id}`,()=>{
  // This tests representation only, not whether legacy preview seconds were source facts.
  const v=structuredClone(f.ir);v.schema='hero-semantic-ir@5';for(const [s,value] of Object.entries(v.slots) as any[]){
    const positive=value.windup!==null&&value.windup>0;value.castTiming={requirement:positive?'required':'not_specified',seconds:positive?value.windup:null,
      evidence:positive?f.source.slots.find((x:any)=>x.slot===s).originalText:null};delete value.windup;delete value.sourceEvidence;delete value.vfxRecommendation;}
  both(v,true);const old=compileIR(f.ir,f.source,catalog),b=compileIR5(v,f.source,catalog);
  assert.deepEqual(b.compiled,old.compiled);assert.deepEqual(b.project,old.project);assert.equal(b.sourceEntailmentVerified,false);
});
for(const id of ['community7-lux','community7-xerath'])test(`source candidate compiles without arbitrary target numbers: ${id}`,()=>{
  const f=wholePlan5(id),before=structuredClone(f.ir);both(f.ir,true);const b=compileIR5(f.ir,f.source,catalog);
  assert.deepEqual(f.ir,before);assert.equal(Object.keys(b.compiled.abilityDrafts).length,6);assert.equal(b.automaticAccept,false);
  if(id==='community7-lux')assert.deepEqual(b.compiled,compileIR4(wholePlan(id).ir,f.source,catalog).compiled);
});
test('required unknown windup retains both semantic selector and nonzero preview',()=>{
  const f=wholePlan5('community7-xerath'),r=resolveIR5(f.ir,f.source);
  assert.equal(r.ir5.slots.Q.castTiming.requirement,'required');assert.equal(r.ir5.slots.Q.castTiming.seconds,null);
  assert.equal(r.ir4.slots.Q.windup,0.3);assert(r.previewProposals.some(p=>p.location==='Q.castTiming'&&p.field==='seconds'));
});
test('unspecified repeat policy is not converted into a claimed source label',()=>{
  const f=wholePlan5('community7-xerath'),r=resolveIR5(f.ir,f.source);
  assert.equal(r.ir5.slots.Q.actions[0].repeatHits,null);assert.equal(r.ir4.slots.Q.actions[0].repeatHits,'once_per_cast');
  assert(r.unresolvedSourceChoices.some(c=>c.field==='repeatHits'&&!c.uniqueSourceLabel));
});
for(const [label,fn,pattern] of [
  ['required with zero seconds',(a:any)=>a.slots.Q.castTiming.seconds=0,/REQUIRED_WINDUP/],
  ['required with sub-tick seconds',(a:any)=>a.slots.Q.castTiming.seconds=0.001,/REQUIRED_WINDUP/],
  ['required without source quote',(a:any)=>a.slots.Q.castTiming.evidence=null,/UNANCHORED_CAST/],
  ['unanchored quote',(a:any)=>a.slots.Q.castTiming.evidence='這不是任何來源',/UNANCHORED_CAST/],
  ['no windup plus positive seconds',(a:any)=>Object.assign(a.slots.Q.castTiming,{requirement:'none',seconds:0.3}),/NO_WINDUP_CONTRADICTION/],
  ['unspecified plus evidence',(a:any)=>a.slots.Q.castTiming.requirement='not_specified',/UNSPECIFIED_TIMING/],
  ['passive cast request',(a:any)=>a.slots.PASSIVE.castTiming=a.slots.Q.castTiming,/PASSIVE_CAST/],
] as const)test(`reject semantic contradiction: ${label}`,()=>{const f=wholePlan5('community7-xerath');fn(f.ir);assert.throws(()=>resolveIR5(f.ir,f.source),pattern);});
for(const [label,fn] of [
  ['legacy scalar windup',(a:any)=>a.slots.Q.windup=0.3],['missing timing selector',(a:any)=>delete a.slots.Q.castTiming.requirement],
  ['unknown cast mode',(a:any)=>a.slots.Q.castTiming.requirement='auto'],['missing required control duration',(a:any)=>delete a.slots.E.actions[1].duration],
  ['missing segment count',(a:any)=>delete a.slots.Q.actions[0].count],
  ['null duration in legacy nested child',(a:any)=>a.slots.E.actions=[{op:'projectile',evidence:'example',onHit:[{op:'shield_self',evidence:'example',duration:null,amount:null,absorbs:'magic',stacking:'replace'}]}]],
] as const)test(`structural rejection agrees across schemas: ${label}`,()=>{const f=wholePlan5('community7-xerath');fn(f.ir);both(f.ir,false);});
test('preview configuration cannot erase a required mechanic',()=>{
  const f=wholePlan5('community7-xerath');assert.throws(()=>resolveIR5(f.ir,f.source,{...IR5_PREVIEW,windupSeconds:0}));
  assert.throws(()=>resolveIR5(f.ir,f.source,{...IR5_PREVIEW,shieldDuration:0}));
});
for(const seed of [20260908,20260909])test(`real runtime keeps chant and four strikes with unknown numeric values: ${seed}`,()=>{
  const f=wholePlan5('community7-xerath'),b=compileIR5(f.ir,f.source,catalog),r=engineProbe(b.compiled,catalog,'ir5-windup-required',r=>{
    assert.equal(r.cast('Q'),'ok');assert(r.world.abilities.get(r.caster).cast,'MISSING_CAST_PHASE');
    r.step(1);assert.equal(r.hits('Q').length,0);r.step(9);
    const wave=r.world.delayed.find((w:any)=>String(w.origin).includes(b.compiled.abilityDrafts.Q.id));assert(wave);assert.equal(wave.strikes.length,4);
    r.step(40);assert.equal(r.hits('Q').length,1);return {windupPresent:true,segments:4,repeatPolicyIsPreview:true};
  },seed);assert(r.passed,r.error);
});
test('source explicit no-windup differs from source-unspecified timing',()=>{
  const f=wholePlan5('community7-xerath');f.source=structuredClone(f.source);
  const sourceSlot=f.source.slots.find((s:any)=>s.slot==='Q'),old=sourceSlot.originalText;
  sourceSlot.originalText=old.replace('吟唱後','不需要吟唱，直接');sourceSlot.sourceSha256=hash(sourceSlot.originalText);
  f.source.hero.originalText=f.source.hero.originalText.replace(old,sourceSlot.originalText);f.source.hero.sourceSha256=hash(f.source.hero.originalText);
  for(const s of f.source.sources){s.text=s.text.replace(old,sourceSlot.originalText);s.sha256=hash(s.text);}
  f.ir.slots.Q.actions[0].evidence=sourceSlot.originalText;
  f.ir.slots.Q.castTiming={requirement:'none',seconds:null,evidence:'不需要吟唱'};
  const b=compileIR5(f.ir,f.source,catalog),r=engineProbe(b.compiled,catalog,'no-windup',r=>{
    assert.equal(r.cast('Q'),'ok');assert(!r.world.abilities.get(r.caster).cast);return {casting:false};});assert(r.passed,r.error);
});
test('bounds and unchanged engine pins',()=>{
  const f=wholePlan5('community7-lux');f.ir.extra=f.ir;assert.throws(()=>resolveIR5(f.ir,f.source),/IR_SIZE_DEPTH/);checkEnginePins();
});
