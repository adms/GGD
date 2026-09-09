import assert from 'node:assert/strict';
import test from 'node:test';
import {SLOTS,selectionOf,configurationOf,assetBindingOf,assembleTarget,semanticProjection,parameterContracts,projectExample} from './hero-distillation-compact.mjs';

const slot=(name='技能')=>({slot:name==='技能'?'Q':name,name,purpose:'原需求',maxRank:name==='PASSIVE'||name==='EX'?1:name==='R'?3:4,
  abilityOverrides:{cooldownTier:'小',provenance:'editor-json'},products:[{instanceId:'p',template:{ref:'tpl-effect-sequence',params:{effects:[{kind:'damage',statusId:'hero.x'},{kind:'spawnVfx',vfxId:'fx.prim.arcane.pulse-sm'}]}}}],
  templateConflictPolicy:'reject',tuning:{cooldownSec:10,manaCost:40,range:6},capabilityIds:['damage'],directionOptionIds:[],fallbackOptionIds:[]});

function fixture(){
  const slots=Object.fromEntries(SLOTS.map(s=>[s,slot(s)]));
  const visuals=Object.fromEntries(SLOTS.map(s=>[s,{gameplayEvent:'abilityCast',icon:null,sfxKey:null,vfxLayers:[{vfxKey:'fx.prim.arcane.pulse-sm'}],scriptSelections:[{kind:'vfx',on:'castEffect',at:'point',vfxId:'fx.prim.arcane.pulse-sm'}]}]));
  const target={format:'hero-plan',plan:{schema:'ggd-hero-plan@2',planId:'hero.plan',title:'Hero',summary:'old',sourceLock:{canonicalId:null,versionId:null},origin:'法師',archetype:'mage',attackType:'ranged',budget:{power:50,complexity:50},statOverrides:{ap:'大'},slots},presentationSelection:{modelKey:'champ.thorne',championIcon:null,slots:visuals}};
  const input={request:{heroName:'Hero',identity:'identity',slots:Object.fromEntries(SLOTS.map(s=>[s,{description:s+' desc'}]))},outputContract:{heroName:'Hero'},
    allowedCatalog:{revision:'r',fingerprint:'f',bricksByLayer:{template:['effect-sequence'],effect:['damage','spawnVfx'],hook:['onAbilityHit'],leaf:['status']},unsupported:[],knownBroken:[]}};
  const catalog={revision:'r',fingerprint:'f',bricks:[{id:'effect-sequence',layer:'template',params:[]},{id:'damage',layer:'effect',params:[{name:'amount',origin:'x'}]},{id:'spawnVfx',layer:'effect',params:[{name:'vfxId',type:'string'}]}],constraints:{abilityFields:['x'],simCapabilities:{spawnVfx:{available:true}}}};
  return {target,input,catalog};
}

test('compact selection and config reconstruct every mechanism-bearing field',()=>{
  const {target,input,catalog}=fixture(),selection=selectionOf(target,input,['fx.prim.arcane.pulse-sm']),configuration=configurationOf(target,'hero',catalog,selection),binding=assetBindingOf(target);
  assert.equal(configuration.slots.Q.products[0].template.params.effects[0].statusId,'$hero.x');
  assert.equal(configuration.slots.Q.products[0].template.params.effects[1].vfxId,'$vfx#0');
  assert(!('instanceId' in configuration.slots.Q.products[0]));
  const rebuilt=assembleTarget(selection,configuration,{heroId:'hero',heroName:'Hero',request:input.request,assetBinding:binding,detailedCatalog:catalog});
  assert.deepEqual(semanticProjection(rebuilt,catalog),semanticProjection(target,catalog));
  assert.equal(rebuilt.plan.slots.Q.purpose,'Q desc');
  assert.equal(rebuilt.plan.slots.Q.products[0].instanceId,'hero.q.p1');
  assert.equal(rebuilt.plan.slots.Q.products[0].template.params.effects[1].vfxId,'fx.prim.arcane.pulse-sm');
  assert.deepEqual(rebuilt.plan.slots.Q.directionOptionIds,[]);
});

test('parameter contract contains only selected bricks and strips provenance origin',()=>{
  const {target,input,catalog}=fixture(),selection=selectionOf(target,input,['fx.prim.arcane.pulse-sm']),contracts=parameterContracts(selection,catalog);
  assert.deepEqual(contracts.bricks.map(b=>b.id),['tpl-effect-sequence','damage','spawnVfx']);
  assert.deepEqual(contracts.bricks[1].params,[{n:'amount'}]);
  assert(!('fields' in contracts));
});

test('training messages omit full assets and script-owned asset bindings',()=>{
  const {target,input,catalog}=fixture(),row={id:'hero:HERO',heroId:'hero',groupId:'hero',slot:'HERO',split:'train',teacherSha256:'t',inputKind:'fixture',engineRevision:'e',historicalExposure:'none',messages:[{role:'system',content:'old'},{role:'user',content:JSON.stringify(input)},{role:'assistant',content:JSON.stringify(target)}]};
  const projected=projectExample(row,catalog,['fx.prim.arcane.pulse-sm'],selectionOf(target,input,['fx.prim.arcane.pulse-sm']));
  assert.equal(projected.records.length,1);
  assert.equal(projected.records[0].stage,'select');
  for(const record of projected.records){
    const user=JSON.parse(record.messages[1].content);
    assert(!('assets' in user));assert(!record.messages[2].content.includes('champ.thorne'));
  }
  assert.equal(projected.assetBinding.modelKey,'champ.thorne');
});
