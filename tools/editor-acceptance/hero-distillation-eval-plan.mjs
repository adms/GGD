// Freeze paired generation inputs before seeing this epoch's adapter output.
// No inference, teacher generation, semantic repair or release decision.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const hash=x=>createHash('sha256').update(x).digest('hex');

export function partitionEvaluation(rows){
  const trainGroups=new Set(rows.filter(r=>r.split==='train').map(r=>r.groupId));
  const dev=rows.filter(r=>r.split==='dev');
  assert(dev.length&&dev.every(r=>!trainGroups.has(r.groupId)),'DEV_GROUP_LEAKAGE');
  assert.equal(new Set(dev.map(r=>r.id)).size,dev.length,'DUPLICATE_CASE');
  const cases=[],teachers=[];
  for(const row of dev){
    assert.deepEqual(row.messages.map(m=>m.role),['system','user','assistant'],'MESSAGE_BOUNDARY');
    assert.equal(hash(row.messages[1].content),row.inputSha256,'INPUT_DRIFT');
    assert.equal(hash(row.messages[2].content),row.targetSha256,'TARGET_DRIFT');
    const input=JSON.parse(row.messages[1].content),target=JSON.parse(row.messages[2].content);
    assert.equal(input.outputContract.format,target.format,'OUTPUT_CONTRACT_DRIFT');
    assert.equal(input.outputContract.heroId,row.heroId,'HERO_ID_DRIFT');
    assert.equal(input.outputContract.slot,row.slot,'SLOT_DRIFT');
    const messages=structuredClone(row.messages.slice(0,2));
    cases.push({id:row.id,heroId:row.heroId,groupId:row.groupId,slot:row.slot,
      engineRevision:row.engineRevision,format:input.outputContract.format,
      inputSha256:row.inputSha256,messagesSha256:hash(JSON.stringify(messages)),messages});
    teachers.push({id:row.id,teacherSha256:row.teacherSha256,targetSha256:row.targetSha256,
      answer:row.messages[2].content,teacherModel:'unknown',teacherEffort:'unknown',
      note:'Existing Codex source artifact; historical model/effort/tool budget not established by this frozen dataset.'});
  }
  return {cases,teachers};
}

export function build(source,out){
  assert(!fs.existsSync(out),'REFUSE_OVERWRITE');
  const raw=fs.readFileSync(path.join(source,'manifest.json')),manifest=JSON.parse(raw);
  for(const [name,expected]of Object.entries(manifest.outputs)){
    assert(/^[a-z-]+\.(json|jsonl)$/.test(name),'UNSAFE_SOURCE_PATH');
    assert.equal(hash(fs.readFileSync(path.join(source,name))),expected,'FROZEN_DRIFT:'+name);
  }
  const rows=JSON.parse(fs.readFileSync(path.join(source,'examples.json')));
  const {cases,teachers}=partitionEvaluation(rows);
  assert.equal(cases.length,manifest.counts.dev.tasks);
  const whole=cases.filter(r=>r.slot==='HERO').map(r=>r.id),slots=cases.filter(r=>r.slot!=='HERO').map(r=>r.id);
  assert.equal(whole.length,manifest.counts.dev.wholeHeroes);assert.equal(slots.length,manifest.counts.dev.slots);
  const plan={schema:'ggd-distillation-paired-evaluation-plan@1',sourceManifestSha256:hash(raw),
    status:'inputs-frozen-no-inference',blindTest:false,split:'internal-dev',
    counts:{tasks:cases.length,primaryWholeHeroes:whole.length,secondarySlots:slots.length},
    primaryCaseIds:whole,secondaryCaseIds:slots,
    arms:{base:{modelRevision:'200bb6db075e137a4deb08838865ac4ddb86292e',adapter:null},
      lora:{sameBaseAs:'base',adapter:'fixed-final-one-epoch-checkpoint',adapterSha256:null},
      teacher:{source:'private-teachers.jsonl',model:'unknown',effort:'unknown',freshCodexRun:false}},
    execution:{enabled:false,requiresTerminalTrainingAndAdapterHash:true,
      reason:'This preparation does not authorize concurrent GPU inference or establish a measured generation runtime.',
      sharedInputFile:'public-cases.jsonl',modelSeesOnly:'case.messages',
      teacherFileAvailableToGenerationWorker:false,
      pairedContract:'Same tokenizer/template, no-thinking mode, decoding settings, token limit, arithmetic policy, public assets, compiler and retry policy for base and LoRA; bind all runner/scorer hashes before inference. No per-arm prompt edits or Codex repairs.'},
    scoring:{primaryUnit:'one complete hero, not six independent slot successes',
      primaryDenominator:whole.length,secondarySlotDenominator:slots.length,
      required:['identity-origin-attributes','six-slot-mechanism-completeness','team-time-resource-cross-slot-semantics',
        'schema-capabilities-compile','required-assets-bindings','save-reload-import','isolated-game-selection-and-behavior'],
      success:'All required evidence passes with zero human repair; missing or untested evidence cannot pass.',
      unsupportedOrRejectedCountsAsCreationSuccess:false,ceCountsAsGenerationSuccess:false,
      exactTeacherJsonRequired:false,semanticEquivalenceRequiresBehaviorEvidence:true,
      dangerousAcceptsReportedSeparately:true,vfxCannotCompensateMechanicsFailure:true},
    limitations:['These 119 cases are exposed internal dev, not the unseen final generalization batch.',
      'Teacher provenance is retained, but historical Codex model/effort/budget are unknown, not fabricated.',
      'Runner, scorer, game receipts and new adapter are not supplied by this manifest. No scores exist yet.']};
  fs.mkdirSync(out,{recursive:true});const outputs={};
  const save=(name,value)=>{fs.writeFileSync(path.join(out,name),value,{flag:'wx'});outputs[name]=hash(value);};
  save('public-cases.jsonl',cases.map(r=>JSON.stringify(r)).join('\n')+'\n');
  save('private-teachers.jsonl',teachers.map(r=>JSON.stringify(r)).join('\n')+'\n');
  save('plan.json',JSON.stringify(plan,null,2)+'\n');
  save('manifest.json',JSON.stringify({schema:'ggd-distillation-evaluation-inputs@1',sourceManifestSha256:hash(raw),
    builderSha256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),outputs,inferenceStarted:false},null,2)+'\n');
  return plan.counts;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  assert.equal(process.argv.length,4,'USAGE: FROZEN_DIR NEW_OUTPUT');
  console.log(JSON.stringify(build(...process.argv.slice(2).map(p=>path.resolve(p)))));
}
