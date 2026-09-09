import assert from 'node:assert/strict';
import test from 'node:test';
import {SLOTS,selectionOf,configurationOf,assetBindingOf,semanticProjection} from './hero-distillation-compact.mjs';
import {parseCompactJson,validateSelection,assembleCompactRuntime} from './hero-distillation-compact-runtime.mjs';

function fixture(){
  const ability={cooldownTier:'小',provenance:'editor-json'},product={instanceId:'old',template:{ref:'tpl-effect-sequence',params:{effects:[{kind:'damage',amount:10},{kind:'spawnVfx',vfxId:'fx.prim.arcane.pulse-sm'}]}}};
  const slots=Object.fromEntries(SLOTS.map(slot=>[slot,{slot,name:slot,maxRank:slot==='PASSIVE'||slot==='EX'?1:slot==='R'?3:4,abilityOverrides:ability,products:[product],templateConflictPolicy:'reject',tuning:{cooldownSec:10,manaCost:40,range:6},capabilityIds:['damage'],directionOptionIds:[],fallbackOptionIds:[]}]));
  const visual=Object.fromEntries(SLOTS.map(slot=>[slot,{gameplayEvent:'abilityCast',icon:null,sfxKey:null,vfxLayers:[],scriptSelections:[]}]));
  const target={format:'hero-plan',plan:{schema:'ggd-hero-plan@2',planId:'hero.plan',title:'Hero',summary:'old',sourceLock:{canonicalId:null,versionId:null},origin:'法師',archetype:'mage',attackType:'ranged',budget:{power:50},statOverrides:{ap:'大'},slots},presentationSelection:{modelKey:'champ.thorne',championIcon:null,slots:visual}};
  const input={request:{identity:'hero identity',slots:Object.fromEntries(SLOTS.map(slot=>[slot,{description:slot+' requirement'}]))},allowedCatalog:{revision:'r',fingerprint:'f',bricksByLayer:{template:['effect-sequence'],effect:['damage','spawnVfx'],hook:[],leaf:[]},unsupported:[],knownBroken:[]}};
  const catalog={bricks:[{id:'effect-sequence',layer:'template',params:[]},{id:'damage',layer:'effect',params:[]},{id:'spawnVfx',layer:'effect',params:[]}],constraints:{simCapabilities:{damage:{available:true},spawnVfx:{available:true}}}};
  const selection=selectionOf(target,input,['fx.prim.arcane.pulse-sm']),config=configurationOf(target,'hero',catalog,selection),binding=assetBindingOf(target);
  const space={revision:'r',fingerprint:'f',templates:['tpl-effect-sequence'],effects:['damage','spawnVfx'],hooks:[],conditions:[],vfxStyles:['arcane.pulse-sm'],vfxStyleAxes:{elements:['arcane'],shapes:['pulse-sm'],fallback:'arcane.pulse-sm'},unsupported:[],knownRestrictions:[]};
  return {target,input,catalog,selection,config,binding,space};
}

test('runtime accepts seven bounded decisions and script assembles a hero plan',()=>{
  const {target,input,catalog,selection,config,binding,space}=fixture();
  const actual=assembleCompactRuntime({selection,slotConfigurations:Object.fromEntries(SLOTS.map(slot=>[slot,{format:'forge-slot-config-delta@1',slot,configuration:config.slots[slot]}])),decisionSpace:space,context:{heroId:'hero',heroName:'Hero',request:input.request,assetBinding:binding,detailedCatalog:catalog}});
  assert.deepEqual(semanticProjection(actual,catalog),semanticProjection(target,catalog));
  assert.equal(actual.plan.slots.Q.products[0].instanceId,'hero.q.p1');
  assert.equal(actual.presentationSelection.modelKey,'champ.thorne');
});

test('runtime rejects narration, native IDs, and unselected semantic choices',()=>{
  const {selection,space,config}=fixture();
  assert.throws(()=>parseCompactJson('```json {} ```'),/COMPACT_JSON_PARSE_FAILED/);
  const native=structuredClone(selection);native.slots.Q.vfxStyles=['fx.prim.arcane.pulse-sm'];
  assert.throws(()=>validateSelection(native,space),/OUTSIDE_SPACE|SCRIPT_OWNED_NATIVE_VALUE/);
  const escaped=structuredClone(config.slots.Q);escaped.products[0].template.params.effects[0].kind='heal';
  assert.throws(()=>assembleCompactRuntime({selection,slotConfigurations:Object.fromEntries(SLOTS.map(slot=>[slot,{format:'forge-slot-config-delta@1',slot,configuration:slot==='Q'?escaped:config.slots[slot]}])),decisionSpace:space,context:{heroId:'hero',heroName:'Hero',request:{slots:{}},assetBinding:{slots:Object.fromEntries(SLOTS.map(slot=>[slot,{icon:null,sfxKey:null}])),modelKey:'champ.thorne',championIcon:null},detailedCatalog:fixture().catalog}}),/UNKNOWN_SEMANTIC_KIND/);
});
