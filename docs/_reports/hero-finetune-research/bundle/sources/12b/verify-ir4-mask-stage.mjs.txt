import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.resolve(process.argv[2]);
assert.equal(path.dirname(out),here);assert(!fs.existsSync(out));
const sha=x=>createHash('sha256').update(x).digest('hex'),read=f=>JSON.parse(fs.readFileSync(path.join(here,f),'utf8'));
const data=read('mechanism-mask-controls-v1/dataset.private.json'),dataManifest=read('mechanism-mask-controls-v1/manifest.json');
assert.equal(sha(JSON.stringify(data)),dataManifest.datasetSha256);
const tokenManifest=read('mechanism-mask-tokens-v1/manifest.json'),tokens=read('mechanism-mask-tokens-v1/tokens.private.json');
assert.equal(sha(JSON.stringify(tokens)),tokenManifest.tokenizedDataSha256);assert.equal(tokenManifest.datasetSha256,dataManifest.datasetSha256);
assert.equal(tokenManifest.scriptSha256,sha(fs.readFileSync(path.join(here,'prepare-semantic-mask.py'))));
const prompts=read('ir4-controls-base-v1/prompt-check.json'),requests=read('ir4-controls-base-v1/requests.json');
for(let i=0;i<data.length;i++){
  assert.deepEqual(data[i].messages,requests[i].messages);assert.equal(tokens[i].promptTokens,prompts.counts[i]);
  assert.equal(tokens[i].labelMask.length,tokens[i].ids.length);assert.equal(tokens[i].labelMask.reduce((n,x)=>n+x,0),tokens[i].directLossTokens);
  assert(tokens[i].excludedSpans.every(s=>s.overlappingTokens>0));assert.equal(tokens[i].trainingAdmitted,false);
}
const raw=read('ir4-controls-base-v1/raw.json'),manual=read('IR4_CONTROL_MANUAL_REVIEW.json'),assessment=read('ir4-controls-base-v1-assessment/manifest.json');
assert.equal(manual.rawSha256,sha(fs.readFileSync(path.join(here,'ir4-controls-base-v1/raw.json'))));
assert.equal(manual.cases.length,2);assert(manual.fullSourceAndBothRawResponsesRead);assert.equal(assessment.counts.irValid,0);
const acceptance=read('whole-plan-acceptance-v1/manifest.json');assert.equal(acceptance.sourceChecks.passed,58);
assert.equal(acceptance.policyChecks.passed,4);assert(acceptance.zeroAuthoredCooldownRejectedBothSeeds);
for(const manifest of [dataManifest,acceptance,assessment])for(const [f,h] of Object.entries(manifest.checkerPins))assert.equal(sha(fs.readFileSync(path.join(here,f))),h);
const gpu=read('IR4_CONTROL_GPU_VERIFICATION_V1.json');assert(gpu.ownWorkerFinished&&gpu.originalModelFilesUnchanged.every(f=>f.unchanged));
const repo=path.join(here,'isolated-engine-v1/GGD-community-hero-forge'),py='/private/tmp/ggd-qwen38-eval-20260907-venv/bin/python';
const commands=[
  {name:'schema',program:process.execPath,args:['--import','tsx','--test',path.join(here,'isolated-engine-v1/outputs/hero-forge-12b-restart-20260908/ir4-json-schema.test.mts')],cwd:repo,count:16},
  {name:'spans',program:process.execPath,args:['--test',path.join(here,'semantic-loss-mask.test.mjs')],cwd:here,count:9},
  {name:'token-alignment',program:py,args:[path.join(here,'test_semantic_mask.py')],cwd:here,count:5},
  {name:'loss-alignment',program:py,args:[path.join(here,'test_semantic_training_loss.py')],cwd:here,count:3},
  {name:'mlx-cpu-loss-gradient',program:py,args:[path.join(here,'test_semantic_training_loss_mlx.py')],cwd:here,count:1},
];
fs.mkdirSync(out);const tests=[];
for(const c of commands){const start=Date.now(),r=spawnSync(c.program,c.args,{cwd:c.cwd,encoding:'utf8',timeout:60000,maxBuffer:1024*1024});
  const log=r.stdout+'\n'+r.stderr;fs.writeFileSync(path.join(out,c.name+'.txt'),log,{flag:'wx'});assert.equal(r.status,0,log);
  assert(c.program===py?log.includes(`Ran ${c.count} test`):log.includes(`pass ${c.count}`),'COUNT_MISMATCH');
  tests.push({name:c.name,count:c.count,passed:true,seconds:(Date.now()-start)/1000,logSha256:sha(log)});
}
const summary={schema:'ggd-ir4-mask-stage-verification@1',createdAt:new Date().toISOString(),tests,passedTests:tests.reduce((n,r)=>n+r.count,0),
  sourceChecks:acceptance.sourceChecks,policyChecks:acceptance.policyChecks,zeroAuthoredCooldownRejectedBothSeeds:true,
  maskDatasetSha256:dataManifest.datasetSha256,maskTokenDataSha256:tokenManifest.tokenizedDataSha256,
  exactInferenceAndTrainingControlMessagesMatch:true,manualReviewBoundToRaw:true,modelCounts:assessment.counts,
  gpuSeconds:gpu.supervisedSeconds,peakMetalGiB:Math.max(...gpu.results.map(r=>r.peakMetalGiB)),resources:gpu.resources,
  gpuWorkerFinished:true,sharedGpuLockAbsent:!fs.existsSync('/private/tmp/ggd-forge-training-runtime/gpu.lock'),
  trainingAdmitted:0,modelTrainingStarted:false,fullHeroQualified:0,goalComplete:false,
  admissionHold:'Source-required windup is entangled with masked numeric preview. Separate selector before using full-IR masks for SFT.'};
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(summary,null,2));
