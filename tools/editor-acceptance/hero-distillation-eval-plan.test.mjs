import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {partitionEvaluation} from './hero-distillation-eval-plan.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
function sample(){
  const input=JSON.stringify({outputContract:{format:'hero-plan',heroId:'h',slot:'HERO'},request:'PUBLIC_REQUEST'});
  const answer=JSON.stringify({format:'hero-plan',secret:'PRIVATE_TEACHER_SENTINEL'});
  return {id:'h:HERO',heroId:'h',groupId:'h',slot:'HERO',split:'dev',inputSha256:hash(input),targetSha256:hash(answer),
    messages:[{role:'system',content:'PUBLIC_SYSTEM'},{role:'user',content:input},{role:'assistant',content:answer}]};
}
test('only public prompt messages are exported to inference; teacher bytes remain private',()=>{
  const row=sample(),before=structuredClone(row),result=partitionEvaluation([row]);
  assert.deepEqual(row,before);assert.deepEqual(result.cases[0].messages,row.messages.slice(0,2));
  assert(!JSON.stringify(result.cases).includes('PRIVATE_TEACHER_SENTINEL'));
  assert.equal(result.teachers[0].answer,row.messages[2].content);
  assert.equal(result.teachers[0].teacherModel,'unknown');
});
test('reject group leakage, duplicate cases, source drift and inconsistent output contract',()=>{
  const row=sample();
  assert.throws(()=>partitionEvaluation([row,{...row,id:'train',split:'train'}]),/DEV_GROUP_LEAKAGE/);
  assert.throws(()=>partitionEvaluation([row,row]),/DUPLICATE_CASE/);
  assert.throws(()=>partitionEvaluation([{...row,inputSha256:'bad'}]),/INPUT_DRIFT/);
  assert.throws(()=>partitionEvaluation([{...row,targetSha256:'bad'}]),/TARGET_DRIFT/);
  assert.throws(()=>partitionEvaluation([{...row,heroId:'different'}]),/HERO_ID_DRIFT/);
});
const frozen=process.env.HERO74_FROZEN;
test('all 119 internal-dev cases and exactly 17 whole heroes are preserved',{skip:!frozen},()=>{
  const rows=JSON.parse(fs.readFileSync(path.join(frozen,'examples.json')));
  const {cases,teachers}=partitionEvaluation(rows),dev=rows.filter(r=>r.split==='dev');
  assert.equal(cases.length,119);assert.equal(cases.filter(r=>r.slot==='HERO').length,17);
  assert.equal(cases.filter(r=>r.slot!=='HERO').length,102);
  assert.deepEqual(cases.map(r=>r.id),dev.map(r=>r.id));
  assert.deepEqual(teachers.map(r=>r.answer),dev.map(r=>r.messages[2].content));
  for(let i=0;i<cases.length;i++)assert.deepEqual(cases[i].messages,dev[i].messages.slice(0,2));
});
