import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {build} from './hero-distillation-blind-teacher-seal.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const put=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof value==='string'?value:JSON.stringify(value));};

function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'blind-teacher-')),evaluation=path.join(root,'evaluation'),
    candidate=path.join(root,'candidate'),teachers=path.join(root,'teachers.jsonl'),out=path.join(root,'out');
  const content=JSON.stringify({outputContract:{heroId:'new',slot:'HERO',format:'hero-plan'},request:{heroName:'New'}}),
    cases=[{id:'new:HERO',heroId:'new',messages:[{role:'system',content:'system'},{role:'user',content}]}],
    publicBytes=cases.map(JSON.stringify).join('\n')+'\n',plan={split:'blind-user-batch',blindTest:true,
      blindProtocol:{teacherAnswersVisibleToCandidate:false,usedForTraining:false,usedForTuning:false,checkpointSelectedBeforeGeneration:true}};
  put(path.join(evaluation,'public-cases.jsonl'),publicBytes);put(path.join(evaluation,'plan.json'),plan);
  put(path.join(evaluation,'manifest.json'),{outputs:{'public-cases.jsonl':hash(publicBytes),'plan.json':hash(fs.readFileSync(path.join(evaluation,'plan.json')))}});
  const evalHash=hash(fs.readFileSync(path.join(evaluation,'manifest.json')));
  put(path.join(candidate,'manifest.json'),{blindTest:true,evaluationManifestSha256:evalHash});
  put(path.join(candidate,'state.json'),{status:'completed',finishedAt:Date.parse('2026-09-09T00:00:00Z')/1000});
  put(path.join(candidate,'result.json'),{blindTest:true,candidateOutputsSealedBeforeTeacher:true});
  put(path.join(candidate,'inference/manifest.json'),{blindTest:true,evaluationManifestSha256:evalHash,caseIds:['new:HERO']});
  for(const arm of ['base','lora']){
    put(path.join(candidate,`inference/${arm}/state.json`),{status:'completed',workerPid:null});
    put(path.join(candidate,`inference/${arm}/index.json`),[{id:'new:HERO'}]);
    const raw='{"format":"hero-plan"}';put(path.join(candidate,`inference/${arm}/case-0000.json`),{id:'new:HERO',arm,raw,rawSha256:hash(raw)});
  }
  const teacher={id:'new:HERO',answer:'{"format":"hero-plan","plan":{}}',teacherModel:'gpt-test',teacherEffort:'medium',
    generatedAt:'2026-09-10T00:00:00Z',budget:{toolCalls:2,inputTokens:100,outputTokens:50,wallSeconds:3.5}};
  put(teachers,JSON.stringify(teacher)+'\n');return {root,evaluation,candidate,teachers,out,teacher};
}

test('seals teacher only after both candidate arms and records budget',()=>{
  const f=fixture(),m=build(f.evaluation,f.candidate,f.teachers,f.out),rows=fs.readFileSync(path.join(f.out,'private-teachers.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(m.counts.tasks,1);assert.deepEqual(m.teacherBudget,{toolCalls:2,inputTokens:100,outputTokens:50,wallSeconds:3.5});
  assert.equal(rows[0].teacherModel,'gpt-test');assert.equal(m.teacherVisibleToCandidateGeneration,false);
  assert.equal(m.outputs['private-teachers.jsonl'],hash(fs.readFileSync(path.join(f.out,'private-teachers.jsonl'))));
});

test('rejects incomplete candidate or teacher order before creating output',()=>{
  const f=fixture();put(path.join(f.candidate,'inference/lora/state.json'),{status:'running',workerPid:9});
  assert.throws(()=>build(f.evaluation,f.candidate,f.teachers,f.out),/CANDIDATE_ARM_NOT_COMPLETED/);assert(!fs.existsSync(f.out));
  const g=fixture();g.teacher.id='other:HERO';put(g.teachers,JSON.stringify(g.teacher)+'\n');
  assert.throws(()=>build(g.evaluation,g.candidate,g.teachers,g.out),/TEACHER_DENOMINATOR_OR_ORDER_DRIFT/);assert(!fs.existsSync(g.out));
});

test('rejects missing budget fields, format drift and teacher leak in evaluation',()=>{
  const f=fixture();delete f.teacher.budget.inputTokens;put(f.teachers,JSON.stringify(f.teacher)+'\n');
  assert.throws(()=>build(f.evaluation,f.candidate,f.teachers,f.out),/TEACHER_BUDGET_FIELDS/);
  const g=fixture();g.teacher.answer='{"format":"native-content"}';put(g.teachers,JSON.stringify(g.teacher)+'\n');
  assert.throws(()=>build(g.evaluation,g.candidate,g.teachers,g.out),/TEACHER_OUTPUT_FORMAT_DRIFT/);
  const h=fixture();put(path.join(h.evaluation,'private-teachers.jsonl'),'leak');
  assert.throws(()=>build(h.evaluation,h.candidate,h.teachers,h.out),/TEACHER_ALREADY_PRESENT/);
  const i=fixture();i.teacher.generatedAt='2026-09-08T00:00:00Z';put(i.teachers,JSON.stringify(i.teacher)+'\n');
  assert.throws(()=>build(i.evaluation,i.candidate,i.teachers,i.out),/TEACHER_NOT_GENERATED_AFTER_CANDIDATE_SEAL/);
});
