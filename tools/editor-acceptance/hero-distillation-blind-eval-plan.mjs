// Freeze an unseen user hero batch after checkpoint selection and before inference.
// The input contains public system/user messages only; no teacher answers are read.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const hash = value => createHash('sha256').update(value).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file));
const exactKeys = (value, keys, label) => assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), label);
const CASE_KEYS = ['id','heroId','groupId','slot','engineRevision','format','inputSha256','messagesSha256','messages'];
const FORMATS = new Set(['native-slot','hero-slot','native-content','hero-plan']);

function trainingEvidence(run){
  const manifestRaw = fs.readFileSync(path.join(run,'manifest.json'));
  const manifest = JSON.parse(manifestRaw);
  const state = read(path.join(run,'train/state.json'));
  assert.equal(state.status,'completed','TRAIN_NOT_COMPLETED');
  assert.equal(state.workerPid,null,'TRAIN_WORKER_STILL_ATTACHED');
  assert.equal(state.manifestSha256,hash(manifestRaw),'TRAIN_MANIFEST_DRIFT');
  const resultRaw = fs.readFileSync(path.join(run,'train/result.json'));
  const result = JSON.parse(resultRaw);
  assert.equal(manifest.epochs,1,'NOT_SINGLE_EPOCH');
  assert.equal(result.steps,manifest.steps,'INCOMPLETE_EPOCH');
  assert.equal(result.uniqueTrainingTasks,manifest.steps,'REPEATED_TRAINING_TASKS');
  const roundtrip = read(path.join(run,'train/adapter-roundtrip.json'));
  assert.equal(roundtrip.passed,true,'ADAPTER_ROUNDTRIP_REQUIRED');
  const checkpoint = result.checkpoint;
  assert.equal(checkpoint.step,manifest.steps,'NOT_FINAL_CHECKPOINT');
  assert.equal(checkpoint.path,`checkpoint-${String(manifest.steps).padStart(4,'0')}`,'UNSAFE_CHECKPOINT_PATH');
  const adapter = path.join(run,'train',checkpoint.path,'adapters.safetensors');
  assert.equal(hash(fs.readFileSync(adapter)),checkpoint.sha256,'ADAPTER_DRIFT');
  const data = path.resolve(manifest.dataDirectory);
  assert.equal(hash(fs.readFileSync(path.join(data,'manifest.json'))),manifest.frozenManifestSha256,'TRAINING_DATASET_DRIFT');
  const seen = new Set();
  for(const name of ['train.jsonl','dev.jsonl']){
    for(const line of fs.readFileSync(path.join(data,name),'utf8').trim().split('\n')){
      if(!line) continue;
      const row=JSON.parse(line);
      assert.equal(row.id.split(':',1)[0],row.heroId,'TRAINING_HERO_ID_DRIFT');
      seen.add(row.heroId);
    }
  }
  return {manifest,manifestSha256:hash(manifestRaw),resultSha256:hash(resultRaw),checkpoint,seen};
}

export function validateCases(rows,seen){
  assert(rows.length>0,'EMPTY_BLIND_BATCH');
  assert.equal(new Set(rows.map(row=>row.id)).size,rows.length,'DUPLICATE_BLIND_CASE');
  for(const row of rows){
    exactKeys(row,CASE_KEYS,'BLIND_CASE_FIELDS');
    assert.equal(typeof row.heroId,'string'); assert(row.heroId,'EMPTY_HERO_ID');
    assert.equal(row.id.split(':',1)[0],row.heroId,'BLIND_HERO_ID_DRIFT');
    assert(!seen.has(row.heroId),'BLIND_HERO_OVERLAP:'+row.heroId);
    assert(['PASSIVE','Q','W','E','R','EX','HERO'].includes(row.slot),'UNKNOWN_SLOT');
    assert(FORMATS.has(row.format),'UNKNOWN_FORMAT');
    assert.deepEqual(row.messages.map(message=>message.role),['system','user'],'PUBLIC_MESSAGES_ONLY');
    assert(row.messages.every(message=>typeof message.content==='string'),'NON_STRING_MESSAGE');
    assert.equal(hash(row.messages[1].content),row.inputSha256,'BLIND_INPUT_DRIFT');
    assert.equal(hash(JSON.stringify(row.messages)),row.messagesSha256,'BLIND_MESSAGES_DRIFT');
    const contract=JSON.parse(row.messages[1].content).outputContract;
    assert.deepEqual([contract.heroId,contract.slot,contract.format],[row.heroId,row.slot,row.format],'OUTPUT_CONTRACT_DRIFT');
  }
  assert(rows.some(row=>row.slot==='HERO'),'WHOLE_HERO_REQUIRED');
}

export function build(run,input,out){
  run=path.resolve(run); input=path.resolve(input); out=path.resolve(out);
  assert(!fs.existsSync(out),'REFUSE_OVERWRITE');
  const training=trainingEvidence(run);
  const raw=fs.readFileSync(input);
  const rows=raw.toString('utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
  validateCases(rows,training.seen);
  const sourceSha256=hash(raw);
  assert.notEqual(sourceSha256,training.manifest.frozenManifestSha256,'BLIND_REUSES_TRAINING_DATASET');
  const primary=rows.filter(row=>row.slot==='HERO').map(row=>row.id);
  const secondary=rows.filter(row=>row.slot!=='HERO').map(row=>row.id);
  const blindProtocol={teacherAnswersVisibleToCandidate:false,usedForTraining:false,
    usedForTuning:false,checkpointSelectedBeforeGeneration:true};
  const plan={schema:'ggd-distillation-paired-evaluation-plan@1',sourceManifestSha256:sourceSha256,
    trainingFrozenManifestSha256:training.manifest.frozenManifestSha256,
    status:'blind-inputs-frozen-after-checkpoint-before-inference',blindTest:true,split:'blind-user-batch',blindProtocol,
    counts:{tasks:rows.length,primaryWholeHeroes:primary.length,secondarySlots:secondary.length},
    primaryCaseIds:primary,secondaryCaseIds:secondary,
    arms:{base:{modelRevision:training.manifest.modelRevision,adapter:null},
      lora:{sameBaseAs:'base',adapter:'fixed-final-one-epoch-checkpoint',adapterSha256:training.checkpoint.sha256},
      teacher:{source:'pending-after-candidate-generation',candidateCanReadTeacher:false}},
    execution:{enabled:false,requiresCandidateGenerationBeforeTeacher:true,sharedInputFile:'public-cases.jsonl',
      modelSeesOnly:'case.messages',teacherFileAvailableToGenerationWorker:false,
      pairedContract:'Base and LoRA use the same frozen public messages, model revision, decoding, arithmetic, compiler and retry policy.'},
    scoring:{primaryUnit:'one complete hero',successThreshold:.95,dangerousAcceptsRequired:0,
      unsupportedOrRejectedCountsAsCreationSuccess:false,missingEvidencePasses:false,
      semanticEquivalenceRequiresBehaviorEvidence:true,vfxCannotCompensateMechanicsFailure:true},
    limitations:['This freezes inputs and checkpoint identity; it does not generate candidates, teacher answers or quality evidence.',
      'The teacher must be generated only after candidate outputs are sealed.']};
  fs.mkdirSync(out,{recursive:true}); const outputs={};
  const save=(name,value)=>{fs.writeFileSync(path.join(out,name),value,{flag:'wx'});outputs[name]=hash(value);};
  save('public-cases.jsonl',rows.map(row=>JSON.stringify(row)).join('\n')+'\n');
  save('plan.json',JSON.stringify(plan,null,2)+'\n');
  save('manifest.json',JSON.stringify({schema:'ggd-distillation-evaluation-inputs@1',sourceManifestSha256:sourceSha256,
    trainingManifestSha256:training.manifestSha256,trainingResultSha256:training.resultSha256,
    checkpointSha256:training.checkpoint.sha256,builderSha256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),
    outputs,inferenceStarted:false,teacherGenerated:false},null,2)+'\n');
  return plan;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  assert.equal(process.argv.length,5,'USAGE: TRAINING_RUN PUBLIC_CASES_JSONL NEW_OUTPUT');
  console.log(JSON.stringify(build(...process.argv.slice(2)).counts));
}
