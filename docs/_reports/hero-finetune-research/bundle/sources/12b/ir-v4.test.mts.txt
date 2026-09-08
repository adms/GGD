import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtures} from './ir-fixtures.mts';
import {compileIR,checkEnginePins,currentCatalog} from './ir-compiler.mts';
import {compileIR4,lowerIR4} from './ir4-compiler.mts';
import {validateIR4,ACTIONS4} from './ir-v4.mts';
import {wholePlan} from './whole-plan-seeds-v1.mts';
import {runIRProbes} from './ir-behavior.mts';
import {sourceNegativeProbes} from './source-negative-probes.mts';
const catalog=currentCatalog();checkEnginePins();
function asV4(old:any){const a=structuredClone(old);a.schema='hero-semantic-ir@4';
  for(const s of Object.values(a.slots) as any[]){delete s.sourceEvidence;delete s.vfxRecommendation;}return a;}
for(const f of fixtures)test(`legacy project, compiled bytes and probes unchanged: ${f.id}`,()=>{
  const old=compileIR(f.ir,f.source,catalog),actual=compileIR4(asV4(f.ir),f.source,catalog);
  assert.deepEqual(actual.project,old.project);assert.deepEqual(actual.compiled,old.compiled);
  const p=runIRProbes(actual.compiled,f.id,catalog),n=sourceNegativeProbes(actual.compiled,f.source,catalog);
  assert.equal(p.passed,p.total);assert.equal(n.passed,n.total);assert.equal(actual.automaticAccept,false);
});
for(const id of ['community7-lux','community7-xerath'])test(`full six slots compose without internal validation markers: ${id}`,()=>{
  const f=wholePlan(id),before=structuredClone(f.ir),b=compileIR4(f.ir,f.source,catalog);
  assert.equal(Object.keys(b.compiled.abilityDrafts).length,6);assert.deepEqual(f.ir,before);
  assert.equal(b.project.sourceDesign!.ownerText,f.source.hero.originalText);
  assert(!JSON.stringify(b).includes('[internal: native-only'));assert.equal(b.lowered.sourceEntailmentVerified,false);
  assert.equal(b.automaticAccept,false);assert.equal(b.releaseQualified,false);
});
test('22 operations exposed; nested children stay on legacy-only schema',()=>assert.equal(Object.keys(ACTIONS4).length,22));
for(const [label,mutate,pattern] of [
  ['unanchored native evidence',(a:any)=>a.slots.R.actions[0].evidence='不存在於來源的證據',/UNANCHORED_NATIVE/],
  ['native PASSIVE',(a:any)=>a.slots.PASSIVE.actions=[a.slots.R.actions[0]],/NATIVE_PASSIVE/],
  ['wrong line delivery',(a:any)=>a.slots.R.delivery='targeted',/LINE_DELIVERY/],
  ['missing repeat policy',(a:any)=>delete a.slots.R.actions[0].repeatHits,undefined],
  ['unapproved line tracking',(a:any)=>a.slots.R.actions[0].homing=true,undefined],
  ['source metadata injection',(a:any)=>a.slots.Q.sourceEvidence=['x'],undefined],
  ['missing legacy required duration',(a:any)=>delete a.slots.Q.actions[0].duration,undefined],
  ['unanchored legacy evidence',(a:any)=>a.slots.Q.actions[0].evidence='不存在的舊動作來源',/UNANCHORED/],
  ['invented operation',(a:any)=>a.slots.R.actions[0].op='win_game',undefined],
  ['missing slot',(a:any)=>delete a.slots.E,undefined],
  ['reserved validation marker',(a:any)=>a.slots.R.mechanismGaps.push('[internal: native-only slot checked separately; never an output gap]'),/RESERVED_GAP/],
  ['undeclared resource edge',(a:any)=>a.slots.R.cost={key:'nonexistent',count:1},undefined],
  ['nested native action',(a:any)=>a.slots.Q.actions=[{op:'projectile',evidence:a.slots.Q.actions[0].evidence,onHit:[a.slots.R.actions[0]]}],undefined],
] as const)test(`reject ${label}`,()=>{const f=wholePlan('community7-lux');mutate(f.ir);assert.throws(()=>validateIR4(f.ir,f.source),pattern);});
test('legacy and native order is not silently regrouped',()=>{
  const f=wholePlan('community7-xerath');
  assert.deepEqual(lowerIR4(f.ir,f.source).slots.EX.products[0].params.effects.map((e:any)=>e.kind),['shield','restore']);
  f.ir.slots.EX.actions.reverse();
  assert.deepEqual(lowerIR4(f.ir,f.source).slots.EX.products[0].params.effects.map((e:any)=>e.kind),['restore','shield']);
});
test('source-unspecified gameplay policy never gets promoted to a correct training label',()=>{
  const f=wholePlan('community7-xerath'),choice=f.choices.find(c=>c.path==='slots.Q.actions.0.repeatHits');
  assert.equal(choice.trainingLabelEligible,false);assert.equal(f.trainingAdmitted,false);
});
test('pure movement does not acquire leap damage through the legacy validation view',()=>{
  const f=wholePlan('community7-lux');f.ir.slots.R.actions=[{op:'move_only',evidence:f.ir.slots.R.actions[0].evidence,
    direction:'aim',travelRule:'fixed_distance',collisionRule:'engine_default',distance:null,speed:null}];
  const b=lowerIR4(f.ir,f.source),e=b.slots.R.products[0].params.effects;
  assert.equal(e.length,1);assert.equal(e[0].kind,'dash');assert(!('onEnd' in e[0]));
  // Evidence anchoring does not prove entailment: Lux R does not request a dash.
  assert.equal(b.sourceEntailmentVerified,false);assert.equal(b.automaticAccept,false);
});
test('native-only real gaps survive private compatibility validation',()=>{
  const f=wholePlan('community7-lux');f.ir.slots.R.mechanismGaps.push('尚缺來源行為覆蓋');
  const v=validateIR4(f.ir,f.source);assert(v.gaps.some(g=>g.reason==='尚缺來源行為覆蓋'));
  assert.equal(v.completeMechanismClaim,false);
});
test('depth and cycle guards run before recursive parsing',()=>{
  const f=wholePlan('community7-lux');let p=f.ir;for(let i=0;i<30;i++)p=p.extra={};
  assert.throws(()=>validateIR4(f.ir,f.source),/IR_SIZE_DEPTH/);
  const c=wholePlan('community7-lux');c.ir.extra=c.ir;assert.throws(()=>validateIR4(c.ir,c.source),/IR_SIZE_DEPTH/);
});
test('engine pins unchanged',()=>checkEnginePins());
