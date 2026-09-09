import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {build} from './hero-distillation-blind-eval-plan.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value));};

function fixture(options={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ggd-blind-plan-'));
  const run=path.join(root,'run'),data=path.join(root,'data'),input=path.join(root,'cases.jsonl'),out=path.join(root,'out');
  write(path.join(data,'manifest.json'),{schema:'fixture'}); const frozen=hash(fs.readFileSync(path.join(data,'manifest.json')));
  const publicMessage=JSON.stringify({outputContract:{heroId:'new',slot:'HERO',format:'hero-plan'}});
  const messages=[{role:'system',content:'system'},{role:'user',content:publicMessage}];
  const row={id:'new:HERO',heroId:'new',groupId:'new',slot:'HERO',engineRevision:'fixed',format:'hero-plan',
    inputSha256:hash(publicMessage),messagesSha256:hash(JSON.stringify(messages)),messages};
  const trainMessage=JSON.stringify({outputContract:{heroId:options.overlap?'new':'seen',slot:'HERO',format:'hero-plan'}});
  const trainMessages=[{role:'system',content:'system'},{role:'user',content:trainMessage},{role:'assistant',content:'{}'}];
  const trainRow={id:(options.overlap?'new':'seen')+':HERO',heroId:options.overlap?'new':'seen',messages:trainMessages};
  for(const name of ['train.jsonl','dev.jsonl']) write(path.join(data,name),JSON.stringify(trainRow)+'\n');
  const manifest={epochs:1,steps:1,frozenManifestSha256:frozen,dataDirectory:data,modelRevision:'revision'};
  write(path.join(run,'manifest.json'),manifest);
  write(path.join(run,'train/state.json'),{status:options.running?'running':'completed',workerPid:null,
    manifestSha256:hash(fs.readFileSync(path.join(run,'manifest.json')))});
  const adapter=Buffer.from('adapter'); write(path.join(run,'train/checkpoint-0001/adapters.safetensors'),adapter);
  write(path.join(run,'train/result.json'),{steps:1,uniqueTrainingTasks:1,
    checkpoint:{step:1,path:'checkpoint-0001',sha256:hash(adapter)}});
  write(path.join(run,'train/adapter-roundtrip.json'),{passed:true});
  if(options.assistant){row.messages.push({role:'assistant',content:'teacher'});row.messagesSha256=hash(JSON.stringify(row.messages));}
  write(input,JSON.stringify(row)+'\n');
  return {root,run,input,out};
}

test('freezes disjoint public inputs and final checkpoint without teacher data',()=>{
  const f=fixture(); const plan=build(f.run,f.input,f.out);
  assert.equal(plan.blindTest,true); assert.equal(plan.counts.primaryWholeHeroes,1);
  assert.equal(plan.arms.lora.adapterSha256,hash(Buffer.from('adapter')));
  assert.equal(fs.existsSync(path.join(f.out,'private-teachers.jsonl')),false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.out,'manifest.json'))).teacherGenerated,false);
});

test('rejects train/dev overlap, assistant answers and unfinished training',()=>{
  const overlap=fixture({overlap:true}); assert.throws(()=>build(overlap.run,overlap.input,overlap.out),/BLIND_HERO_OVERLAP:new/);
  const assistant=fixture({assistant:true}); assert.throws(()=>build(assistant.run,assistant.input,assistant.out),/PUBLIC_MESSAGES_ONLY/);
  const running=fixture({running:true}); assert.throws(()=>build(running.run,running.input,running.out),/TRAIN_NOT_COMPLETED/);
});

test('refuses overwrite and detects adapter drift',()=>{
  const f=fixture(); build(f.run,f.input,f.out); assert.throws(()=>build(f.run,f.input,f.out),/REFUSE_OVERWRITE/);
  const drift=fixture(); write(path.join(drift.run,'train/checkpoint-0001/adapters.safetensors'),'changed');
  assert.throws(()=>build(drift.run,drift.input,drift.out),/ADAPTER_DRIFT/);
});
