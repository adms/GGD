// Runtime boundary for the compact Hero Forge interface.  A model may choose
// semantic templates and non-default values only; this module rejects any
// attempt to manufacture script-owned JSON or to escape the selected catalog.
import assert from 'node:assert/strict';
import {SLOTS,assembleTarget} from './hero-distillation-compact.mjs';

const own=(value,key)=>Object.hasOwn(value,key);
const exact=(value,keys,code)=>{assert(value&&typeof value==='object'&&!Array.isArray(value),code);assert.deepEqual(Object.keys(value).sort(),[...keys].sort(),code);};
const plain=(value,code)=>{assert(value&&typeof value==='object'&&!Array.isArray(value),code);};
const unique=(values,code)=>assert.equal(new Set(values).size,values.length,code);
const clone=value=>structuredClone(value);
const SCRIPT_KEYS=new Set(['instanceId','provenance','capabilityIds','directionOptionIds','fallbackOptionIds','modelKey','championIcon','icon','sfxKey','vfxKey','attach','replaces']);

/** Strictly parse exactly one JSON object.  Fences, narration and repair are
 * intentionally not accepted: retry the bounded model call instead. */
export function parseCompactJson(text){
  assert.equal(typeof text,'string','COMPACT_JSON_TEXT_REQUIRED');
  let value;
  try{value=JSON.parse(text);}catch{throw new Error('COMPACT_JSON_PARSE_FAILED');}
  plain(value,'COMPACT_JSON_OBJECT_REQUIRED');return value;
}

function rejectScriptOwned(value){
  if(Array.isArray(value)){value.forEach(rejectScriptOwned);return;}
  if(!value||typeof value!=='object'){
    if(typeof value==='string')assert(!value.startsWith('fx.prim.')&&!value.startsWith('$vfx.')&&!value.startsWith('assets/')&&!value.startsWith('champ.'),'SCRIPT_OWNED_NATIVE_VALUE');
    return;
  }
  for(const [key,item] of Object.entries(value)){
    assert(!SCRIPT_KEYS.has(key),'SCRIPT_OWNED_FIELD:'+key);
    rejectScriptOwned(item);
  }
}

function validateIdentity(identity){
  exact(identity,['origin','archetype','attackType','budget','statOverrides'],'COMPACT_IDENTITY_KEYS');
  assert.equal(typeof identity.origin,'string','COMPACT_IDENTITY_ORIGIN');
  assert.equal(typeof identity.archetype,'string','COMPACT_IDENTITY_ARCHETYPE');
  assert.equal(typeof identity.attackType,'string','COMPACT_IDENTITY_ATTACK_TYPE');
  plain(identity.budget,'COMPACT_IDENTITY_BUDGET');plain(identity.statOverrides,'COMPACT_IDENTITY_STATS');
}

function validateSlotSelection(selection,space,slot){
  exact(selection,['templates','effects','hooks','conditions','vfxStyles'],'COMPACT_SLOT_SELECTION_KEYS:'+slot);
  for(const key of ['templates','effects','hooks','conditions','vfxStyles']){
    assert(Array.isArray(selection[key])&&selection[key].every(id=>typeof id==='string'),`COMPACT_SLOT_${key.toUpperCase()}_ARRAY:${slot}`);
    unique(selection[key],`COMPACT_SLOT_${key.toUpperCase()}_DUPLICATE:${slot}`);
  }
  const permitted={templates:new Set(space.templates),effects:new Set(space.effects),hooks:new Set(space.hooks),conditions:new Set(space.conditions),vfxStyles:new Set(space.vfxStyles)};
  for(const key of Object.keys(permitted))assert(selection[key].every(id=>permitted[key].has(id)),`COMPACT_SLOT_${key.toUpperCase()}_OUTSIDE_SPACE:${slot}`);
}

export function validateSelection(selection,decisionSpace){
  exact(decisionSpace,['revision','fingerprint','templates','effects','hooks','conditions','vfxStyles','vfxStyleAxes','unsupported','knownRestrictions'],'DECISION_SPACE_SHAPE');
  exact(selection,['format','identity','slots'],'COMPACT_SELECTION_KEYS');
  assert.equal(selection.format,'forge-selection@1','COMPACT_SELECTION_FORMAT');
  validateIdentity(selection.identity);exact(selection.slots,SLOTS,'COMPACT_SELECTION_SLOTS');
  for(const slot of SLOTS)validateSlotSelection(selection.slots[slot],decisionSpace,slot);
  rejectScriptOwned(selection);return clone(selection);
}

function selectedReferences(value,selection,space,slot){
  if(Array.isArray(value)){value.forEach(item=>selectedReferences(item,selection,space,slot));return;}
  if(!value||typeof value!=='object')return;
  if(typeof value.ref==='string'){
    assert(space.templates.includes(value.ref),'UNKNOWN_TEMPLATE_REFERENCE:'+slot);
    assert(selection.templates.includes(value.ref),'UNSELECTED_TEMPLATE_REFERENCE:'+slot);
  }
  if(typeof value.kind==='string'){
    const domain=space.effects.includes(value.kind)?'effects':space.conditions.includes(value.kind)?'conditions':null;
    assert(domain,'UNKNOWN_SEMANTIC_KIND:'+slot);
    assert(selection[domain].includes(value.kind),'UNSELECTED_SEMANTIC_KIND:'+slot);
  }
  if(typeof value.on==='string'){
    assert(space.hooks.includes(value.on),'UNKNOWN_HOOK:'+slot);
    assert(selection.hooks.includes(value.on),'UNSELECTED_HOOK:'+slot);
  }
  Object.values(value).forEach(item=>selectedReferences(item,selection,space,slot));
}

function validateConfigBody(configuration,selection,space,slot){
  exact(configuration,['name','abilityOverrides','products','tuning'],'COMPACT_SLOT_CONFIG_KEYS:'+slot);
  assert.equal(typeof configuration.name,'string','COMPACT_SLOT_NAME:'+slot);
  plain(configuration.abilityOverrides,'COMPACT_SLOT_OVERRIDES:'+slot);
  assert(Array.isArray(configuration.products)&&configuration.products.length>0,'COMPACT_SLOT_PRODUCTS:'+slot);
  plain(configuration.tuning,'COMPACT_SLOT_TUNING:'+slot);
  rejectScriptOwned(configuration);
  selectedReferences(configuration.products,selection,space,slot);
  const styles=new Set(selection.vfxStyles);
  const checkVfx=value=>{
    if(Array.isArray(value))return value.forEach(checkVfx);
    if(!value||typeof value!=='object')return;
    for(const item of Object.values(value)){
      if(typeof item==='string'&&item.startsWith('$vfx#')){
        assert(/^\$vfx#\d+$/.test(item),'COMPACT_VFX_REFERENCE_FORMAT:'+slot);
        assert(styles.has(selection.vfxStyles[Number(item.slice(5))]),'COMPACT_VFX_REFERENCE_OUT_OF_RANGE:'+slot);
      }
      checkVfx(item);
    }
  };
  checkVfx(configuration.products);
}

export function validateSlotConfiguration(configuration,selection,decisionSpace,slot){
  exact(configuration,['format','slot','configuration'],'COMPACT_SLOT_CONFIGURATION_KEYS');
  assert.equal(configuration.format,'forge-slot-config-delta@1','COMPACT_SLOT_CONFIGURATION_FORMAT');
  assert.equal(configuration.slot,slot,'COMPACT_SLOT_CONFIGURATION_SLOT');
  validateConfigBody(configuration.configuration,selection.slots[slot],decisionSpace,slot);return clone(configuration);
}

/** Combine one selection and six independently retried slot deltas.  The
 * deterministic assembler adds IDs, catalog defaults, VFX wiring and engine
 * metadata; neither teacher data nor an implicit fallback is consulted. */
export function assembleCompactRuntime({selection,slotConfigurations,decisionSpace,context}){
  const safeSelection=validateSelection(selection,decisionSpace);
  exact(slotConfigurations,SLOTS,'COMPACT_RUNTIME_SIX_SLOT_CONFIGS');
  const slots={};
  for(const slot of SLOTS)slots[slot]=validateSlotConfiguration(slotConfigurations[slot],safeSelection,decisionSpace,slot).configuration;
  const {heroId,heroName,request,assetBinding,detailedCatalog}=context??{};
  assert(heroId&&heroName&&request&&assetBinding&&detailedCatalog,'COMPACT_RUNTIME_CONTEXT_REQUIRED');
  return assembleTarget(safeSelection,{format:'forge-config-delta@1',slots},{heroId,heroName,request,assetBinding,detailedCatalog});
}
