import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectDiversity,mechanicShape} from './diversity.mjs';
const a={castType:'targeted',effects:[{kind:'damage',damageType:'magic',amount:{flat:100}},{kind:'applyStatus',statusId:'root',duration:1,rooted:true}]};
const hero=(id,abilities)=>({id,name:id,draft:{abilityDrafts:abilities}});
test('renaming, recoloring, numeric tuning and damage type do not create a new mechanic',()=>{
  const b=structuredClone(a);b.name='new name';b.vfxKey='different-color';b.effects[0].damageType='physical';b.effects[0].amount.flat=200;b.effects[1].duration=2;
  const r=inspectDiversity([hero('a',{Q:a}),hero('b',{R:b})]);
  assert.equal(r.exactDuplicateKitPairs.length,1);
});
test('swapping active slots cannot hide a duplicate kit',()=>{
  const heal={castType:'targeted',targetsEnemies:false,effects:[{kind:'heal',applyTo:'target',amount:{flat:100}}]};
  assert.equal(inspectDiversity([hero('a',{Q:a,W:heal}),hero('b',{W:a,Q:heal})]).exactDuplicateKitPairs.length,1);
});
test('self vs ally and slow vs haste remain different',()=>{
  assert.notDeepEqual(mechanicShape({kind:'heal',applyTo:'self'}),mechanicShape({kind:'heal',applyTo:'target'}));
  assert.notDeepEqual(mechanicShape({moveSpeedMult:0.7}),mechanicShape({moveSpeedMult:1.3}));
});
test('event trigger and outcome order remain meaningful',()=>{
  assert.notDeepEqual(mechanicShape({on:'onEvade'}),mechanicShape({on:'onDamageTaken'}));
  assert.notDeepEqual(mechanicShape([{kind:'heal'},{kind:'damage'}]),mechanicShape([{kind:'damage'},{kind:'heal'}]));
});
