import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {compileFullCase,engineLoader} from './hero-distillation-generation-compile.mts';
import {expandFactorTable} from './hero-distillation-freeze.mjs';
const hash=(x:any)=>createHash('sha256').update(x).digest('hex');
const base=path.resolve('docs/_reports/hero-finetune-research');
const jsonl=(name:string)=>fs.readFileSync(path.join(base,'hero74-eval-plan-v1',name),'utf8').trim().split('\n').map(JSON.parse);
const cases=jsonl('public-cases.jsonl').filter((r:any)=>r.slot==='HERO');
const answers=new Map(jsonl('private-teachers.jsonl').map((r:any)=>[r.id,JSON.parse(r.answer)]));
const models=JSON.parse(fs.readFileSync(path.join(base,'hero74-model-bindings-v1/models.json'),'utf8'));
const loader=engineLoader(path.resolve('.'));
const native=cases.find((r:any)=>r.format==='native-content'),community=cases.find((r:any)=>r.format==='hero-plan');
const engineNative=await loader.loadEngine(native.engineRevision),engineCommunity=await loader.loadEngine(community.engineRevision);

test('all 17 complete dev teachers compile without changing their answers',async()=>{
  assert.equal(cases.length,17);
  for(const row of cases){
    const target=answers.get(row.id),before=JSON.stringify(target);
    const result=compileFullCase(row,target,await loader.loadEngine(row.engineRevision),models);
    assert.equal(Object.keys(result.compiled.abilityDrafts).length,6);
    assert.equal(JSON.stringify(target),before);
  }
});
test('missing slots and wrong hero identity fail without teacher repair',()=>{
  const a=structuredClone(answers.get(native.id));delete a.abilities.EX;
  assert.throws(()=>compileFullCase(native,a,engineNative,models),/SIX_ABILITIES_REQUIRED/);
  const b=structuredClone(answers.get(community.id));b.plan.planId='wrong.plan';
  assert.throws(()=>compileFullCase(community,b,engineCommunity,models),/PLAN_ID_MISMATCH/);
});
test('materializer cannot widen old-case model choices to newer resolver union',()=>{
  const publicAssets=JSON.parse(native.messages[1].content).assets;
  const allowed=new Set([...expandFactorTable(publicAssets.byCollection.models),...publicAssets.uploadedModels.map((m:any)=>m.id)]);
  const extra=Object.keys(models).find(id=>!allowed.has(id));assert(extra,'fixture must include a newer-only model');
  const target=structuredClone(answers.get(native.id));target.champion.modelKey=extra;
  assert.throws(()=>compileFullCase(native,target,engineNative,models),/MODEL_NOT_IN_CASE_PUBLIC_CATALOG/);
});
test('wrong engine, public message drift and unknown mechanics fail closed',()=>{
  assert.throws(()=>compileFullCase(native,answers.get(native.id),engineCommunity,models),/ENGINE_REVISION_MISMATCH/);
  const row=structuredClone(native);row.messages[1].content+=' ';
  assert.throws(()=>compileFullCase(row,answers.get(native.id),engineNative,models),/PUBLIC_MESSAGE_DRIFT/);
  const target=structuredClone(answers.get(native.id));target.abilities.Q.effects=[{kind:'doesNotExist'}];
  assert.throws(()=>compileFullCase(native,target,engineNative,models));
});
test('disk artifacts match control receipt; structural pass never means playable',()=>{
  const directory=path.join(base,'hero74-generation-compile-control-v1');
  const report=JSON.parse(fs.readFileSync(path.join(directory,'report.json'),'utf8'));
  assert.equal(report.sourceEvidence.modelInferenceCalls,0);
  assert.equal(report.counts.primaryWholeHeroes,17);assert.equal(report.counts.structuralPassed,17);
  assert.equal(report.counts.auxiliarySlotsPending,102);assert.equal(report.fullHeroE2EProven,false);
  assert.equal(report.scriptSha256,hash(fs.readFileSync(new URL('./hero-distillation-generation-compile.mts',import.meta.url))));
  for(const [index,row]of report.rows.entries()){
    assert.equal(row.fullHeroE2EProven,false);
    if(row.slot!=='HERO')continue;
    const folder=path.join(directory,`case-${String(index).padStart(4,'0')}`);
    assert.equal(hash(fs.readFileSync(path.join(folder,'authoring.json'))),row.authoringSha256);
    assert.equal(hash(fs.readFileSync(path.join(folder,'compiled.json'))),row.compiledSha256);
  }
});
