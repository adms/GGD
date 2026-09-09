// Small stdin/stdout bridge for the GPU inference supervisor.  It deliberately
// has no model, teacher-answer or engine access: Python obtains model text;
// this canonical JS boundary builds the six own-selection config prompts and
// materializes the resulting HeroPlan.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {SLOTS,parameterContracts} from './hero-distillation-compact.mjs';
import {assembleCompactRuntime,validateSelection} from './hero-distillation-compact-runtime.mjs';

const compact=value=>JSON.stringify(value);
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const stdin=()=>JSON.parse(fs.readFileSync(0,'utf8'));
const exact=(value,keys,code)=>{assert(value&&typeof value==='object'&&!Array.isArray(value),code);assert.deepEqual(Object.keys(value).sort(),[...keys].sort(),code);};

function inputs(root){
  root=path.resolve(root);
  const manifest=read(path.join(root,'manifest.json'));
  assert.equal(manifest.schema,'ggd-distillation-compact-frozen-data@1','COMPACT_DATASET_REQUIRED');
  for(const name of ['decision-space.json','parameter-catalog.json','asset-bindings.json'])assert(fs.existsSync(path.join(root,name)),'COMPACT_RUNTIME_FILE_MISSING:'+name);
  return {decisionSpace:read(path.join(root,'decision-space.json')),detailedCatalog:read(path.join(root,'parameter-catalog.json')),
    assetBindings:read(path.join(root,'asset-bindings.json'))};
}

export function configInput({request,selection,slot},{decisionSpace,detailedCatalog}){
  assert(SLOTS.includes(slot),'COMPACT_CONFIG_SLOT_REQUIRED');
  const safe=validateSelection(selection,decisionSpace);
  return {request,heroSelection:safe,slot,
    parameterContracts:parameterContracts({format:'forge-slot-selection@1',selection:safe.slots[slot]},detailedCatalog),
    outputContract:{format:'forge-slot-config-delta@1',slot}};
}

export function materialize({heroId,heroName,request,selection,slotConfigurations,assetBinding=null},source){
  exact({heroId,heroName,request,selection,slotConfigurations,assetBinding},['heroId','heroName','request','selection','slotConfigurations','assetBinding'],'COMPACT_ASSEMBLY_INPUT_KEYS');
  assert.equal(typeof heroId,'string','COMPACT_ASSEMBLY_HERO_ID');assert.equal(typeof heroName,'string','COMPACT_ASSEMBLY_HERO_NAME');
  const binding=assetBinding??source.assetBindings[heroId];
  assert(binding,'COMPACT_ASSET_BINDING_REQUIRED');
  return assembleCompactRuntime({selection,slotConfigurations,decisionSpace:source.decisionSpace,
    context:{heroId,heroName,request,assetBinding:binding,detailedCatalog:source.detailedCatalog}});
}

function main(args){
  assert.equal(args.length,4,'USAGE: config-input|assemble DATASET');
  const [mode,root]=args.slice(2),source=inputs(root),value=stdin();
  if(mode==='config-input')return configInput(value,source);
  if(mode==='assemble')return materialize(value,source);
  throw new Error('UNKNOWN_COMPACT_RUNTIME_MODE');
}

if(import.meta.url===new URL(process.argv[1],`file://${process.cwd()}/`).href)process.stdout.write(compact(main(process.argv))+'\n');
