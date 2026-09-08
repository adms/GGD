import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {root,loadBaseline,runSequence,evaluateCombo,ablateDraft,hash,probePassiveBehavior} from './sim-harness.mjs';

const {baseline}=loadBaseline();
const source=JSON.parse(readFileSync(resolve(root,'docs/_reports/hero-validation-batch2-37/data/private/compiled/b2-popp.json'),'utf8'));
function fixture(q,w){
  const d=structuredClone(source);delete d.champion.passive;delete d.champion.passiveAbility;delete d.champion.transform;
  for(const [slot,a]of Object.entries(d.abilityDrafts)){
    delete a.passive;delete a.marks;delete a.statusCost;delete a.innateKind;delete a.comboBonus;
    Object.assign(a,{castType:'self',castTimeSec:0,recoverySec:0,cooldown:[0],manaCost:[0],range:20,effects:[]});
    if(slot==='PASSIVE')a.innateKind='active';
  }
  Object.assign(d.abilityDrafts.Q,q);Object.assign(d.abilityDrafts.W,w);
  for(const slot of ['Q','W','E','R'])d.champion.abilities[slot]=d.abilityDrafts[slot];
  return d;
}
const gate={source:'Q',target:'W',waitSec:.2,observeSec:.2,metric:{actor:'caster',field:'shield'},expect:'increase',remove:{slot:'W',kind:'shield'}};
const marked=()=>fixture({effects:[{kind:'applyStatus',statusId:'root',duration:2,applyTo:'self',root:true}]},{effects:[{kind:'shield',amount:{flat:40},duration:2,condition:{kind:'status',subject:'self',statusId:'root'}}]});

test('real source cast causes a conditional shield; missing operation and ablation remove it',()=>{
  const d=marked(),r=evaluateCombo(d,gate,{baseline});
  assert.equal(r.status,'passed');assert(r.values.prepared>0);assert.equal(r.values.unprepared,0);assert.equal(r.values.preparedAblated,0);
  assert(r.runs.prepared.steps[0].accepted);assert(r.runs.prepared.steps[1].accepted);
  assert.equal(hash(d),hash(marked()),'never mutate the teacher');
});

test('the same gate fails when the alleged source does not establish the condition',()=>{
  const d=marked();d.abilityDrafts.Q.effects=[];d.champion.abilities.Q=d.abilityDrafts.Q;
  const r=evaluateCombo(d,gate,{baseline});assert.equal(r.status,'failed');assert.equal(r.interaction,0);
});

test('ongoing source DoT alone is subtracted and cannot fake an unconditional follow-up combo',()=>{
  const d=fixture({castType:'targeted',targetsEnemies:true,effects:[{kind:'dot',damageType:'true',amountPerTick:{flat:2},durationSec:3,intervalSec:.2}]},
    {castType:'targeted',targetsEnemies:true,effects:[{kind:'damage',damageType:'true',amount:{flat:3}}]});
  const r=evaluateCombo(d,{source:'Q',target:'W',waitSec:.3,observeSec:.7,metric:{actor:'foe',field:'hp'},expect:'decrease',remove:{slot:'W',kind:'damage'}},{baseline});
  assert.equal(r.status,'failed');assert(Math.abs(r.interaction)<1e-6);
  assert(r.values.prepared<r.values.unprepared,'the source really continued dealing damage during the response');
});

test('healing amplification is measured as ally HP and leaves the enemy untreated',()=>{
  const d=fixture({effects:[{kind:'applyBuff',applyTo:'self',duration:3,modifiers:[{stat:'outputHealingPct',op:'flat',value:1}]}]},
    {castType:'targeted',targetsEnemies:false,effects:[{kind:'heal',amount:{flat:20}}]});
  const r=evaluateCombo(d,{source:'Q',target:'W',waitSec:.2,observeSec:.2,metric:{actor:'ally',field:'hp'},expect:'increase',remove:{slot:'W',kind:'heal'}},{baseline});
  assert.equal(r.status,'passed');assert(r.interaction>0);
  assert(!r.runs.prepared.events.some(e=>e.type==='heal'&&e.data.target===r.runs.prepared.actors.foe));
});

test('same seed replays every tick and status injection/no-op ablation are refused',()=>{
  const d=marked(),options={baseline,steps:[{kind:'cast',slot:'Q',waitSec:.2},{kind:'cast',slot:'W',waitSec:.2}]};
  assert.equal(hash(runSequence(d,options)),hash(runSequence(d,options)));
  assert.throws(()=>runSequence(d,{...options,setup:{caster:{statuses:['root']}}}),/NO_REQUIRED_STATUS/);
  assert.throws(()=>ablateDraft(d,{slot:'W',kind:'summon'}),/ABLATION_MATCHED_NO_NODE/);
});

test('world-event hooks run in combat while practice seats still honor explicit healing input',()=>{
  const d=fixture({},{}),a=d.abilityDrafts.PASSIVE;
  a.innateKind='passive';a.passive={ranks:[{hooks:[{on:'onHeal',target:'self',effects:[{kind:'shield',amount:{flat:25},duration:1}]}]}]};
  d.champion.passiveAbility=a.id;
  const r=runSequence(d,{baseline,steps:[{kind:'cast',slot:'R',actor:'ally',target:'caster',waitSec:.2}]});
  assert(r.steps[0].accepted);assert.equal(r.after.caster.shield,25);
  assert(r.events.some(e=>e.type==='shieldGained'&&e.data.origin===`hook:abilityPassive:${a.id}`));
});

test('expired raw shield pools are inert and cannot absorb a later real incoming spell',()=>{
  const d=fixture({effects:[{kind:'shield',amount:{flat:100},duration:.2}]},{});
  const r=runSequence(d,{baseline,steps:[{kind:'cast',slot:'Q',waitSec:.1},{kind:'wait',waitSec:.3},{kind:'cast',actor:'foe',slot:'Q',target:'caster',waitSec:.1}]});
  assert.equal(r.steps[1].after.caster.shield,0);assert.equal(r.steps[1].after.caster.rawShields.length,1);
  assert(r.steps[2].after.caster.hp<r.steps[2].before.caster.hp);
  assert.equal(r.steps[2].after.caster.rawShields.length,0);
});

test('explicit silence rejection is causal only if all three controls accept the same spell',()=>{
  const d=fixture({castType:'targeted',targetsEnemies:true,effects:[{kind:'applyStatus',statusId:'numbness',duration:2,silenced:true}]},{});
  const r=evaluateCombo(d,{source:'Q',target:'W',targetActor:'foe',targetTarget:'caster',waitSec:.2,observeSec:.2,
    metric:{actor:'caster',field:'hp'},expect:'increase',remove:{slot:'Q',kind:'applyStatus'},expectedResponseRejection:'silenced'},{baseline});
  assert.equal(r.status,'passed');assert(!r.runs.prepared.steps[1].accepted);
  const wrong=evaluateCombo(d,{source:'Q',target:'W',targetActor:'foe',targetTarget:'caster',waitSec:.2,observeSec:.2,
    metric:{actor:'caster',field:'hp'},expect:'increase',remove:{slot:'Q',kind:'applyStatus'},expectedResponseRejection:'rooted'},{baseline});
  assert.equal(wrong.status,'failed');assert(wrong.validationErrors.includes('EXPECTED_RESPONSE_REJECTION_NOT_OBSERVED'));
});

test('a real passive mana trigger enables a response only with three precisely declared no-mana controls',()=>{
  const d=fixture({},{castType:'targeted',targetsEnemies:false,manaCost:[100],effects:[{kind:'heal',amount:{flat:40}}]}),a=d.abilityDrafts.PASSIVE;
  a.innateKind='passive';a.passive={ranks:[{hooks:[{on:'onAllyDamaged',target:'self',effects:[{kind:'restore',manaPct:.2,applyTo:'self'}]}]}]};
  d.champion.passiveAbility=a.id;
  const combo={source:'Q',sourceActor:'foe',sourceTarget:'ally',target:'W',targetTarget:'ally',waitSec:.2,observeSec:.2,
    setup:{caster:{manaPct:0}},metric:{actor:'ally',field:'hp'},expect:'increase',remove:{slot:'PASSIVE',kind:'restore'},
    expectedControlResponseRejections:{preparedAblated:'no-mana',unprepared:'no-mana',unpreparedAblated:'no-mana'}};
  const r=evaluateCombo(d,combo,{baseline});
  assert.equal(r.status,'passed');assert.equal(r.interaction,40);assert(r.runs.prepared.steps[1].accepted);
  for(const key of Object.keys(combo.expectedControlResponseRejections)){
    assert(!r.runs[key].steps[1].accepted);assert.deepEqual(r.runs[key].steps[1].rejections.map(e=>e.data.reason),['no-mana']);
  }
  const undeclared=evaluateCombo(d,{...combo,expectedControlResponseRejections:undefined},{baseline});
  assert.equal(undeclared.status,'failed');assert.equal(undeclared.validationErrors.filter(e=>e.startsWith('UNDECLARED_CONTROL_RESPONSE_REJECTION:')).length,3);
  const wrong=evaluateCombo(d,{...combo,expectedControlResponseRejections:{...combo.expectedControlResponseRejections,unprepared:'silenced'}},{baseline});
  assert.equal(wrong.status,'failed');assert(wrong.validationErrors.includes('EXPECTED_CONTROL_RESPONSE_REJECTION_NOT_OBSERVED:unprepared:silenced'));
  const missing=evaluateCombo(d,{...combo,expectedControlResponseRejections:{preparedAblated:'no-mana',unprepared:'no-mana'}},{baseline});
  assert.equal(missing.status,'failed');assert(missing.validationErrors.some(e=>e.startsWith('UNDECLARED_CONTROL_RESPONSE_REJECTION:unpreparedAblated:')));
});

test('a declared no-mana control must actually reject instead of quietly accepting',()=>{
  const d=marked(),r=evaluateCombo(d,{...gate,expectedControlResponseRejections:{preparedAblated:'no-mana'}},{baseline});
  assert.equal(r.status,'failed');assert(r.runs.preparedAblated.steps[1].accepted);
  assert(r.validationErrors.includes('EXPECTED_CONTROL_RESPONSE_REJECTION_NOT_OBSERVED:preparedAblated:no-mana'));
});

test('stat metrics read the real stat pipeline and dispel requires a dispellable buff',()=>{
  const d=fixture({castType:'targeted',targetsEnemies:true,effects:[{kind:'applyBuff',applyTo:'target',polarity:'buff',dispellable:true,duration:3,modifiers:[{stat:'ad',op:'flat',value:50}]}]},
    {castType:'targeted',targetsEnemies:true,effects:[{kind:'dispel',shape:'single',pools:{buffs:true},polarity:'buff',count:1}]});
  const r=evaluateCombo(d,{source:'Q',target:'W',waitSec:.2,observeSec:.2,metric:{actor:'foe',field:'stat:ad'},expect:'decrease',remove:{slot:'W',kind:'dispel'}},{baseline});
  assert.equal(r.status,'passed');assert.equal(r.interaction,-50);
});

test('passive cast probes respect the authored abilitySlot filter',()=>{
  const d=fixture({},{}),a=d.abilityDrafts.PASSIVE;
  a.innateKind='passive';a.passive={ranks:[{hooks:[{on:'onAbilityCast',abilitySlot:'W',target:'self',effects:[{kind:'shield',amount:{flat:25},duration:1}]}]}]};
  d.champion.passiveAbility=a.id;
  const probes=probePassiveBehavior(d,{baseline});
  assert.equal(probes[0].status,'passed');assert.equal(probes[0].steps[0].slot,'W');
});

test('control-hook probes choose an executable status carrying the registered cc tag',()=>{
  const d=fixture({castType:'targeted',targetsEnemies:true,effects:[{kind:'applyStatus',statusId:'magic-break',duration:2,silenced:true}]},
    {castType:'targeted',targetsEnemies:true,effects:[{kind:'consumeStatus',shape:'single',statusId:'magic-break',subject:'target',count:'all',onConsumed:[{kind:'applyStatus',statusId:'blind',duration:2,missChance:.5}]}]}),a=d.abilityDrafts.PASSIVE;
  a.innateKind='passive';a.passive={ranks:[{hooks:[{on:'onCrowdControlApplied',target:'self',effects:[{kind:'shield',amount:{flat:25},duration:1}]}]}]};
  d.champion.passiveAbility=a.id;
  const probes=probePassiveBehavior(d,{baseline});
  assert.equal(probes[0].status,'passed');assert.deepEqual(probes[0].steps.map(s=>s.slot),['Q','W']);
});
