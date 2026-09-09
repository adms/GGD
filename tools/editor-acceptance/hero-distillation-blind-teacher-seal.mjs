// Seal teacher answers only after both blind candidate arms are immutable.
// This is CPU/file validation only; it never invokes a model or edits outputs.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const script=fileURLToPath(import.meta.url);
const hash=value=>createHash('sha256').update(value).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const lines=file=>fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const exact=(value,keys,label)=>assert.deepEqual(Object.keys(value).sort(),[...keys].sort(),label);
const save=(file,value)=>fs.writeFileSync(file,value,{flag:'wx'});
const TEACHER_KEYS=['id','answer','teacherModel','teacherEffort','generatedAt','budget'];
const BUDGET_KEYS=['toolCalls','inputTokens','outputTokens','wallSeconds'];

function candidateEvidence(evaluation,candidate,cases){
  const evaluationManifestRaw=fs.readFileSync(path.join(evaluation,'manifest.json')),
    evaluationSha256=hash(evaluationManifestRaw),batchManifest=read(path.join(candidate,'manifest.json')),
    state=read(path.join(candidate,'state.json')),result=read(path.join(candidate,'result.json')),
    inference=path.join(candidate,'inference'),inferenceManifestRaw=fs.readFileSync(path.join(inference,'manifest.json')),
    inferenceManifest=JSON.parse(inferenceManifestRaw);
  assert.equal(batchManifest.blindTest,true,'CANDIDATE_BATCH_NOT_BLIND');
  assert.equal(batchManifest.evaluationManifestSha256,evaluationSha256,'CANDIDATE_EVALUATION_DRIFT');
  assert.equal(state.status,'completed','CANDIDATE_BATCH_NOT_COMPLETED');
  assert(typeof state.finishedAt==='number'&&Number.isFinite(state.finishedAt),'CANDIDATE_FINISH_TIME_REQUIRED');
  assert.equal(result.blindTest,true);assert.equal(result.candidateOutputsSealedBeforeTeacher,true,'CANDIDATE_NOT_SEALED');
  assert.equal(inferenceManifest.blindTest,true);assert.equal(inferenceManifest.evaluationManifestSha256,evaluationSha256);
  assert.deepEqual(inferenceManifest.caseIds,cases.map(row=>row.id),'CANDIDATE_CASE_DRIFT');
  const files={
    'batch/manifest.json':hash(fs.readFileSync(path.join(candidate,'manifest.json'))),
    'batch/state.json':hash(fs.readFileSync(path.join(candidate,'state.json'))),
    'batch/result.json':hash(fs.readFileSync(path.join(candidate,'result.json'))),
    'inference/manifest.json':hash(inferenceManifestRaw)};
  for(const arm of ['base','lora']){
    const armState=read(path.join(inference,arm,'state.json')),index=read(path.join(inference,arm,'index.json'));
    assert.equal(armState.status,'completed','CANDIDATE_ARM_NOT_COMPLETED:'+arm);
    assert.equal(armState.workerPid,null,'CANDIDATE_WORKER_STILL_ATTACHED:'+arm);
    assert.equal(index.length,cases.length,'CANDIDATE_ARM_INCOMPLETE:'+arm);
    assert.deepEqual(index.map(row=>row.id),cases.map(row=>row.id),'CANDIDATE_ARM_CASE_DRIFT:'+arm);
    files[`inference/${arm}/state.json`]=hash(fs.readFileSync(path.join(inference,arm,'state.json')));
    files[`inference/${arm}/index.json`]=hash(fs.readFileSync(path.join(inference,arm,'index.json')));
    for(const [number,row] of index.entries()){
      const name=`case-${String(number).padStart(4,'0')}.json`,bytes=fs.readFileSync(path.join(inference,arm,name)),record=JSON.parse(bytes);
      assert.equal(record.id,cases[number].id);assert.equal(record.arm,arm);
      assert.equal(record.rawSha256,hash(record.raw),'CANDIDATE_RAW_DRIFT:'+record.id);
      files[`inference/${arm}/${name}`]=hash(bytes);
    }
  }
  return {evaluationManifestSha256:evaluationSha256,candidateFiles:files,
    candidateResultSha256:files['batch/result.json'],inferenceManifestSha256:files['inference/manifest.json'],
    candidateFinishedAt:state.finishedAt};
}

export function build(evaluation,candidate,teachers,out){
  evaluation=path.resolve(evaluation);candidate=path.resolve(candidate);teachers=path.resolve(teachers);out=path.resolve(out);
  assert(!fs.existsSync(out),'REFUSE_OVERWRITE');
  const em=read(path.join(evaluation,'manifest.json')),plan=read(path.join(evaluation,'plan.json')),
    publicRaw=fs.readFileSync(path.join(evaluation,'public-cases.jsonl')),
    cases=publicRaw.toString('utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  assert.equal(plan.split,'blind-user-batch','NOT_BLIND_EVALUATION');assert.equal(plan.blindTest,true);
  assert.deepEqual(plan.blindProtocol,{teacherAnswersVisibleToCandidate:false,usedForTraining:false,
    usedForTuning:false,checkpointSelectedBeforeGeneration:true},'INVALID_BLIND_PROTOCOL');
  assert(!fs.existsSync(path.join(evaluation,'private-teachers.jsonl')),'TEACHER_ALREADY_PRESENT_IN_CANDIDATE_EVALUATION');
  assert.equal(hash(publicRaw),em.outputs['public-cases.jsonl'],'PUBLIC_CASES_DRIFT');
  assert.equal(hash(fs.readFileSync(path.join(evaluation,'plan.json'))),em.outputs['plan.json'],'PLAN_DRIFT');
  const candidateSeal=candidateEvidence(evaluation,candidate,cases),provided=lines(teachers);
  assert.deepEqual(provided.map(row=>row.id),cases.map(row=>row.id),'TEACHER_DENOMINATOR_OR_ORDER_DRIFT');
  const sealed=[];let tools=0,inputTokens=0,outputTokens=0,wallSeconds=0;
  for(const [number,row] of provided.entries()){
    exact(row,TEACHER_KEYS,'TEACHER_ROW_FIELDS');exact(row.budget,BUDGET_KEYS,'TEACHER_BUDGET_FIELDS');
    assert(typeof row.teacherModel==='string'&&row.teacherModel,'TEACHER_MODEL_REQUIRED');
    assert(typeof row.teacherEffort==='string'&&row.teacherEffort,'TEACHER_EFFORT_REQUIRED');
    assert(typeof row.generatedAt==='string'&&!Number.isNaN(Date.parse(row.generatedAt)),'TEACHER_TIMESTAMP_REQUIRED');
    assert(Date.parse(row.generatedAt)/1000>candidateSeal.candidateFinishedAt,'TEACHER_NOT_GENERATED_AFTER_CANDIDATE_SEAL');
    for(const key of ['toolCalls','inputTokens','outputTokens'])assert(Number.isInteger(row.budget[key])&&row.budget[key]>=0,'INVALID_TEACHER_BUDGET:'+key);
    assert(typeof row.budget.wallSeconds==='number'&&Number.isFinite(row.budget.wallSeconds)&&row.budget.wallSeconds>=0,'INVALID_TEACHER_BUDGET:wallSeconds');
    assert(typeof row.answer==='string'&&row.answer,'TEACHER_ANSWER_REQUIRED');
    const answer=JSON.parse(row.answer),contract=JSON.parse(cases[number].messages[1].content).outputContract;
    assert.equal(answer.format,contract.format,'TEACHER_OUTPUT_FORMAT_DRIFT:'+row.id);
    const targetSha256=hash(row.answer),teacherSha256=hash(JSON.stringify({model:row.teacherModel,
      effort:row.teacherEffort,generatedAt:row.generatedAt,budget:row.budget,targetSha256}));
    sealed.push({id:row.id,teacherSha256,targetSha256,answer:row.answer,teacherModel:row.teacherModel,
      teacherEffort:row.teacherEffort,generatedAt:row.generatedAt,budget:row.budget,
      note:'Generated and sealed after both candidate arms were already immutable; not visible to candidate generation workers.'});
    tools+=row.budget.toolCalls;inputTokens+=row.budget.inputTokens;outputTokens+=row.budget.outputTokens;wallSeconds+=row.budget.wallSeconds;
  }
  fs.mkdirSync(out,{recursive:true});
  const teacherBytes=sealed.map(row=>JSON.stringify(row)).join('\n')+'\n';
  save(path.join(out,'private-teachers.jsonl'),teacherBytes);
  const manifest={schema:'ggd-distillation-blind-teacher-seal@1',blindTest:true,
    evaluationManifestSha256:candidateSeal.evaluationManifestSha256,publicCasesSha256:hash(publicRaw),
    sourceTeacherAnswers:{path:teachers,sha256:hash(fs.readFileSync(teachers))},candidateSeal,
    outputs:{'private-teachers.jsonl':hash(teacherBytes)},counts:{tasks:sealed.length},
    teacherBudget:{toolCalls:tools,inputTokens,outputTokens,wallSeconds},
    builderSha256:hash(fs.readFileSync(script)),teacherGeneratedAfterCandidateSeal:true,
    teacherVisibleToCandidateGeneration:false,modelPromoted:false,fullHeroE2EProven:false,
    scope:'Teacher-answer sealing after immutable blind Base/LoRA outputs. No generation, scoring, repair, retry or promotion.'};
  save(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}

if(process.argv[1]&&path.resolve(process.argv[1])===script){
  assert.equal(process.argv.length,6,'USAGE: BLIND_EVALUATION COMPLETED_CANDIDATE_BATCH TEACHER_ANSWERS_JSONL NEW_OUTPUT');
  console.log(JSON.stringify(build(...process.argv.slice(2)).counts));
}
