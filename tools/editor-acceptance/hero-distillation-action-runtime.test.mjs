import assert from 'node:assert/strict';
import {test} from 'node:test';
import {newActionState,applyAction,completeActionState} from './hero-distillation-action-runtime.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {assembleActionHero} from './hero-distillation-action-runtime.mjs';

test('runtime derives the next cursor from accepted shapes and rejects native fields',()=>{
  const grammar=['hooks','on','effects','kind','duration'],options={allowedKeys:grammar,maxArrayLength:4};let state=newActionState();
  state=applyAction(state,{format:'forge-next-json-action@1',op:'shape',value:{kind:'object',keys:['hooks']}},options);
  state=applyAction(state,{format:'forge-next-json-action@1',op:'shape',value:{kind:'array',length:1}},options);
  state=applyAction(state,{format:'forge-next-json-action@1',op:'shape',value:{kind:'object',keys:['on','effects']}},options);
  state=applyAction(state,{format:'forge-next-json-action@1',op:'value',value:'onDamage'},options);
  state=applyAction(state,{format:'forge-next-json-action@1',op:'shape',value:{kind:'array',length:1}},options);
  state=applyAction(state,{format:'forge-next-json-action@1',op:'shape',value:{kind:'object',keys:['kind','duration']}},options);
  state=applyAction(state,{format:'forge-next-json-action@1',op:'value',value:'damage'},options);
  state=applyAction(state,{format:'forge-next-json-action@1',op:'value',value:4},options);
  assert.deepEqual(completeActionState(state),{hooks:[{on:'onDamage',effects:[{kind:'damage',duration:4}]}]});
  assert.throws(()=>applyAction(newActionState(),{format:'forge-next-json-action@1',op:'value',value:{instanceId:'bad'}},options),/ACTION_SCRIPT_FIELD/);
});

test('full teacher action trace assembles one complete six-slot HeroPlan without a teacher plan input',()=>{
  const root=path.resolve('docs/_reports/hero-finetune-research'),source=JSON.parse(fs.readFileSync(path.join(root,'hero74-compact-v8/examples.json'),'utf8')),atomic=JSON.parse(fs.readFileSync(path.join(root,'hero74-action-v3/examples.json'),'utf8')),
    catalog=JSON.parse(fs.readFileSync(path.join(root,'hero74-compact-v8/parameter-catalog.json'),'utf8')),space=JSON.parse(fs.readFileSync(path.join(root,'hero74-compact-v8/decision-space.json'),'utf8')),assets=JSON.parse(fs.readFileSync(path.join(root,'hero74-compact-v8/asset-bindings.json'),'utf8'));
  const heroId='community-review-01-20260907',rows=atomic.filter(row=>row.heroId===heroId),answer=row=>JSON.parse(row.messages[2].content),selectionRow=source.find(row=>row.heroId===heroId&&row.slot==='HERO'),request=JSON.parse(selectionRow.messages[1].content).request,heroName=JSON.parse(selectionRow.messages[1].content).outputContract.heroName,
    identity=answer(rows.find(row=>row.stage==='identity')),
    slotSelections=Object.fromEntries(['PASSIVE','Q','W','E','R','EX'].map(slot=>[slot,answer(rows.find(row=>row.stage===`selection:${slot}`))])),
    slotCores=Object.fromEntries(['PASSIVE','Q','W','E','R','EX'].map(slot=>[slot,answer(rows.find(row=>row.stage===`core:${slot}`))])),
    coreActions=Object.fromEntries(['PASSIVE','Q','W','E','R','EX'].map(slot=>[slot,rows.filter(row=>row.stage===`core-action:${slot}`).map(answer)])),
    productActions=Object.fromEntries(['PASSIVE','Q','W','E','R','EX'].map(slot=>{const n=slotCores[slot].productTemplates.length;return[slot,Array.from({length:n},(_,index)=>rows.filter(row=>row.stage===`action:${slot}:${index}`).map(answer))]}));
  const target=assembleActionHero({identity,slotSelections,slotCores,coreActions,productActions,decisionSpace:space,context:{heroId,heroName,request,assetBinding:assets[heroId],detailedCatalog:catalog}});
  assert.equal(target.format,'hero-plan');assert.equal(target.plan.title,heroName);assert.deepEqual(Object.keys(target.plan.slots).sort(),['E','EX','PASSIVE','Q','R','W']);
});
