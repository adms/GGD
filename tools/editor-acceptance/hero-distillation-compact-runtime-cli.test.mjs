import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {SLOTS} from './hero-distillation-compact.mjs';
import {configInput,materialize} from './hero-distillation-compact-runtime-cli.mjs';

const root=path.resolve('docs/_reports/hero-finetune-research/hero74-compact-v8');
const source={decisionSpace:JSON.parse(fs.readFileSync(path.join(root,'decision-space.json'))),detailedCatalog:JSON.parse(fs.readFileSync(path.join(root,'parameter-catalog.json'))),assetBindings:JSON.parse(fs.readFileSync(path.join(root,'asset-bindings.json')))};
const examples=JSON.parse(fs.readFileSync(path.join(root,'examples.json')));

test('own-selection config inputs and assembly roundtrip every frozen hero',()=>{
  const groups=Map.groupBy(examples,row=>row.heroId);let heroes=0;
  for(const [heroId,rows] of groups){
    const whole=rows.find(row=>row.stage==='select'),selection=JSON.parse(whole.messages[2].content),request=JSON.parse(whole.messages[1].content).request;
    const configs=Object.fromEntries(rows.filter(row=>row.stage==='configure').map(row=>[row.slot,JSON.parse(row.messages[2].content)]));
    for(const slot of SLOTS){
      const input=configInput({request,selection,slot},source);
      assert.deepEqual(input.heroSelection,selection);assert.equal(input.outputContract.slot,slot);
      assert(!Object.hasOwn(input.parameterContracts,'fields'));
    }
    const target=materialize({heroId,heroName:request.heroName??heroId,request,selection,slotConfigurations:configs,assetBinding:null},source);
    assert.equal(target.format,'hero-plan');assert.deepEqual(Object.keys(target.plan.slots),SLOTS);heroes++;
  }
  assert.equal(heroes,74);
});
